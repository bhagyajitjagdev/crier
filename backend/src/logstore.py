"""The send log: one JSONL line per outcome.

The daily files under data/logs are the UI's data source and are purged
after RETENTION_DAYS. Every line is mirrored to stdout so whatever ships
container logs (Loki, CloudWatch, ...) owns long-term retention.
"""

import json
import logging
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from src.store import store

logger = logging.getLogger("crier.sendlog")

RETENTION_DAYS = 7

STATUSES = (
    "sent",
    "failed",
    "skipped_unmapped",
    "skipped_expired",
    "skipped_duplicate",
    "test_sent",
)


class LogStore:
    def __init__(self, directory: Path):
        self.dir = directory
        self._purged_on: date | None = None

    def _file(self, day: date) -> Path:
        return self.dir / f"crier-{day.isoformat()}.jsonl"

    def append(self, status: str, **fields) -> None:
        now = datetime.now(timezone.utc)
        line = {"ts": now.isoformat(), "status": status}
        line.update({k: v for k, v in fields.items() if v not in (None, [], "")})
        encoded = json.dumps(line)
        # One write call per line: O_APPEND keeps concurrent writers whole.
        with open(self._file(now.date()), "a") as f:
            f.write(encoded + "\n")
        logger.info(encoded)
        if self._purged_on != now.date():
            self.purge()

    def purge(self) -> None:
        cutoff = datetime.now(timezone.utc).date() - timedelta(days=RETENTION_DAYS)
        for path in self.dir.glob("crier-*.jsonl"):
            try:
                day = date.fromisoformat(path.stem.removeprefix("crier-"))
            except ValueError:
                continue
            if day < cutoff:
                path.unlink(missing_ok=True)
        self._purged_on = datetime.now(timezone.utc).date()

    def _lines(self):
        """All retained lines, newest first."""
        for path in sorted(self.dir.glob("crier-*.jsonl"), reverse=True):
            try:
                lines = path.read_text().splitlines()
            except OSError:
                continue
            for raw in reversed(lines):
                try:
                    yield json.loads(raw)
                except json.JSONDecodeError:
                    continue

    def read(
        self,
        *,
        status: str | None = None,
        event_type: str | None = None,
        limit: int = 200,
    ) -> list[dict]:
        out = []
        for line in self._lines():
            if status and line.get("status") != status:
                continue
            if event_type and line.get("type") != event_type:
                continue
            out.append(line)
            if len(out) >= limit:
                break
        return out

    def analytics(self) -> dict:
        """Counts by day, by event type, and in total, over the retained window."""
        days: dict[str, dict[str, int]] = {}
        types: dict[str, dict[str, int]] = {}
        totals: dict[str, int] = {}
        for line in self._lines():
            status = line.get("status", "unknown")
            day = line.get("ts", "")[:10]
            days.setdefault(day, {})[status] = days.get(day, {}).get(status, 0) + 1
            etype = line.get("type", "unknown")
            types.setdefault(etype, {})[status] = types.get(etype, {}).get(status, 0) + 1
            totals[status] = totals.get(status, 0) + 1
        return {
            "days": [{"date": d, "counts": c} for d, c in sorted(days.items())],
            "types": [{"type": t, "counts": c} for t, c in sorted(types.items())],
            "totals": totals,
        }


sendlog = LogStore(store.logs_dir)
