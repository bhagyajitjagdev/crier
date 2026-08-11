import json

from fastapi import APIRouter, HTTPException

from config import DLQ_MAXLEN, DLQ_STREAM, EVENTS_STREAM
from src.consumer import consumer
from src.logstore import STATUSES, sendlog

router = APIRouter(tags=["logs"])


@router.get("/api/logs")
def read_logs(status: str | None = None, type: str | None = None, limit: int = 200):
    if status and status not in STATUSES:
        raise HTTPException(status_code=400, detail=f"status must be one of {STATUSES}")
    return sendlog.read(status=status, event_type=type, limit=min(limit, 1000))


@router.get("/api/logs/analytics")
def analytics():
    return sendlog.analytics()


@router.get("/api/dlq")
async def list_dlq(limit: int = 200):
    """Parked events, newest first — the 'needs attention' inbox."""
    entries = await consumer.redis.xrevrange(DLQ_STREAM, count=min(limit, 1000))
    out = []
    for entry_id, fields in entries:
        try:
            event = json.loads(fields.get("data", "null"))
        except json.JSONDecodeError:
            event = None
        out.append(
            {
                "id": entry_id,
                "reason": fields.get("reason"),
                "failed_at": fields.get("failed_at"),
                "event": event,
            }
        )
    return out


async def _pop_entry(entry_id: str) -> dict:
    entries = await consumer.redis.xrange(DLQ_STREAM, min=entry_id, max=entry_id)
    if not entries:
        raise HTTPException(status_code=404, detail="No such DLQ entry")
    return entries[0][1]


@router.post("/api/dlq/{entry_id}/resend")
async def resend(entry_id: str):
    """Put the event back on the main stream and drop it from the DLQ."""
    fields = await _pop_entry(entry_id)
    await consumer.redis.xadd(
        EVENTS_STREAM, {"data": fields.get("data", "")}, maxlen=DLQ_MAXLEN * 10,
        approximate=True,
    )
    await consumer.redis.xdel(DLQ_STREAM, entry_id)
    return {"ok": True}


@router.delete("/api/dlq/{entry_id}")
async def discard(entry_id: str):
    await _pop_entry(entry_id)
    await consumer.redis.xdel(DLQ_STREAM, entry_id)
    return {"ok": True}
