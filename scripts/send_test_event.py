"""Publish a test event onto crier:events — end-to-end without a producer app.

    cd backend && uv run python ../scripts/send_test_event.py --to you@example.com
"""

import argparse
import json
import uuid
from datetime import datetime, timedelta, timezone

import redis

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--redis", default="redis://localhost:6380/0")
parser.add_argument("--type", default="demo.welcome")
parser.add_argument("--to", required=True)
parser.add_argument("--payload", default='{"name": "Ada"}', help="JSON object")
parser.add_argument("--event-id", default=None, help="defaults to a fresh uuid")
parser.add_argument(
    "--age-seconds", type=int, default=0, help="backdate created_at, for expiry tests"
)
args = parser.parse_args()

event = {
    "event_id": args.event_id or str(uuid.uuid4()),
    "type": args.type,
    "to": args.to,
    "cc": [],
    "payload": json.loads(args.payload),
    "created_at": (
        datetime.now(timezone.utc) - timedelta(seconds=args.age_seconds)
    ).isoformat(),
}

r = redis.from_url(args.redis)
entry = r.xadd("crier:events", {"data": json.dumps(event)})
print(f"published {event['event_id']} as {entry.decode()}")
