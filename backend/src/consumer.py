"""Consumes crier:events and turns them into email.

Events are XADDed with a single `data` field holding the event JSON:

    {"event_id": "...", "type": "...", "to": "...", "cc": [],
     "payload": {...}, "created_at": "ISO-8601"}

Delivery semantics: the dedup key is set only AFTER a successful send. A
crash before the send leaves no key, so the reclaimed entry is delivered;
a crash after the send (before the ack) leaves the key, so the reclaimed
entry is skipped as a duplicate. Failed / expired / unmapped events are
acked and parked on crier:dlq, where the UI can inspect and resend them.
"""

import asyncio
import json
import logging
import time
from datetime import datetime, timezone

import redis.asyncio as aioredis

from config import (
    CONSUMER_GROUP,
    DEDUP_PREFIX,
    DEDUP_TTL_SECONDS,
    DLQ_MAXLEN,
    DLQ_STREAM,
    EVENTS_STREAM,
    settings,
)
from src import sender
from src.logstore import sendlog
from src.store import store

logger = logging.getLogger("crier.consumer")

CONSUMER_NAME = "crier-1"
CLAIM_IDLE_MS = 60_000
TRIM_INTERVAL_S = 60


class Consumer:
    def __init__(self):
        # socket_timeout must comfortably exceed the XREADGROUP block: the
        # server's empty reply lands one RTT after the block expires, so a
        # deadline equal to the block turns every idle poll over a real
        # network into a TimeoutError and a needless reconnect.
        self.redis = aioredis.from_url(
            settings.redis_url, decode_responses=True, socket_timeout=30
        )
        self.last_beat: datetime | None = None
        self._task: asyncio.Task | None = None
        self._last_trim = 0.0

    def start(self) -> None:
        self._task = asyncio.create_task(self._run(), name="crier-consumer")

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        await self.redis.aclose()

    async def _run(self) -> None:
        while True:
            try:
                await self._ensure_group()
                while True:
                    self.last_beat = datetime.now(timezone.utc)
                    await self._claim_stale()
                    await self._trim()
                    resp = await self.redis.xreadgroup(
                        CONSUMER_GROUP,
                        CONSUMER_NAME,
                        {EVENTS_STREAM: ">"},
                        count=32,
                        block=5000,
                    )
                    for _stream, entries in resp or []:
                        for entry_id, fields in entries:
                            await self._process(entry_id, fields)
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("consumer crashed, reconnecting in 5s")
                await asyncio.sleep(5)

    async def _ensure_group(self) -> None:
        try:
            await self.redis.xgroup_create(
                EVENTS_STREAM, CONSUMER_GROUP, id="0", mkstream=True
            )
        except aioredis.ResponseError as error:
            if "BUSYGROUP" not in str(error):
                raise

    async def _claim_stale(self) -> None:
        """Re-deliver entries a dead (or previous) consumer left pending."""
        _next, entries, *_ = await self.redis.xautoclaim(
            EVENTS_STREAM,
            CONSUMER_GROUP,
            CONSUMER_NAME,
            min_idle_time=CLAIM_IDLE_MS,
            count=32,
        )
        for entry_id, fields in entries:
            await self._process(entry_id, fields)

    async def _trim(self) -> None:
        """XACK never removes entries, so the stream would grow for the life
        of the deployment. Trim by MINID derived from consumption progress —
        never MAXLEN, which drops unconsumed entries when producers burst.
        The oldest PENDING entry must survive the trim: it is the delivered-
        but-unacked state XAUTOCLAIM replays after a crash. Assumes Crier's
        group is the stream's only consumer group.
        """
        now = time.monotonic()
        if now - self._last_trim < TRIM_INTERVAL_S:
            return
        self._last_trim = now
        pending = await self.redis.xpending(EVENTS_STREAM, CONSUMER_GROUP)
        if pending and pending.get("pending", 0) > 0 and pending.get("min"):
            min_id = pending["min"]
        else:
            groups = await self.redis.xinfo_groups(EVENTS_STREAM)
            ours = next(
                (g for g in groups if g["name"] == CONSUMER_GROUP), None
            )
            if ours is None:
                return
            min_id = ours["last-delivered-id"]
        # Exact trim: at transactional-email volume the cost is trivial, and
        # approximate (~) trimming never fires on small streams at all.
        await self.redis.xtrim(EVENTS_STREAM, minid=min_id, approximate=False)

    async def _ack(self, entry_id: str) -> None:
        await self.redis.xack(EVENTS_STREAM, CONSUMER_GROUP, entry_id)

    async def _park(self, event: dict, reason: str) -> None:
        await self.redis.xadd(
            DLQ_STREAM,
            {
                "data": json.dumps(event),
                "reason": reason,
                "failed_at": datetime.now(timezone.utc).isoformat(),
            },
            maxlen=DLQ_MAXLEN,
            approximate=True,
        )

    async def _process(self, entry_id: str, fields: dict) -> None:
        try:
            event = json.loads(fields.get("data", ""))
            assert isinstance(event, dict)
        except (json.JSONDecodeError, AssertionError):
            sendlog.append("failed", error="malformed event", raw=fields.get("data"))
            await self._park({"raw": fields.get("data")}, "malformed event")
            await self._ack(entry_id)
            return

        event_id = str(event.get("event_id") or entry_id)
        etype = event.get("type", "")
        base = {
            "event_id": event_id,
            "type": etype,
            "to": event.get("to"),
            "payload": event.get("payload"),
        }

        if await self.redis.exists(DEDUP_PREFIX + event_id):
            sendlog.append("skipped_duplicate", **base)
            await self._ack(entry_id)
            return

        spec = store.get_event_types().get(etype)
        if spec is None:
            sendlog.append("skipped_unmapped", **base, error="unknown event type")
            await self._park(event, "unknown event type")
            await self._ack(entry_id)
            return
        if not spec.get("enabled", True):
            # Deliberately turned off — log it, but don't fill the DLQ.
            sendlog.append("skipped_unmapped", **base, error="event type disabled")
            await self._ack(entry_id)
            return

        max_age = spec.get("max_age_seconds")
        created_at = event.get("created_at")
        if max_age and created_at:
            try:
                created = datetime.fromisoformat(created_at)
                age = (datetime.now(timezone.utc) - created).total_seconds()
            except ValueError:
                age = None
            if age is not None and age > max_age:
                sendlog.append(
                    "skipped_expired", **base, error=f"event is {int(age)}s old"
                )
                await self._park(event, f"expired ({int(age)}s > {max_age}s)")
                await self._ack(entry_id)
                return

        template = store.read_template(spec["template"], "published")
        if template is None:
            error = f"published template '{spec['template']}' missing"
            sendlog.append("failed", **base, error=error)
            await self._park(event, error)
            await self._ack(entry_id)
            return

        try:
            html = sender.render_html(template, event.get("payload") or {})
            subject = sender.render_subject(
                spec.get("subject", ""), event.get("payload") or {}
            )
        except Exception as error:
            sendlog.append("failed", **base, error=f"render: {error}")
            await self._park(event, f"render: {error}")
            await self._ack(entry_id)
            return

        to = event.get("to")
        if not to:
            sendlog.append("failed", **base, error="no recipient")
            await self._park(event, "no recipient")
            await self._ack(entry_id)
            return

        try:
            await sender.send_with_retry(
                sender.config_for(store.get_config(), spec),
                to=to,
                cc=event.get("cc") or [],
                subject=subject,
                html=html,
            )
        except Exception as error:
            sendlog.append("failed", **base, error=str(error))
            await self._park(event, str(error))
            await self._ack(entry_id)
            return

        await self.redis.set(DEDUP_PREFIX + event_id, "1", ex=DEDUP_TTL_SECONDS)
        sendlog.append("sent", **base, subject=subject)
        await self._ack(entry_id)


consumer = Consumer()
