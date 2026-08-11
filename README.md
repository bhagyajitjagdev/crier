# Crier

Event-driven transactional email, self-hosted in one container. Your backend
publishes events onto a Redis Stream; Crier consumes them, renders an HTML
template with the event's payload, and delivers over SMTP. No database — 
templates, config, and the send log are plain files on a volume.

- **No event, no email.** Every send is the consequence of one event.
- **Durable**: Redis Streams consumer group — events survive restarts, a
  crash mid-send is redelivered, a crash post-send is deduplicated.
- **Draft → publish** template workflow with per-event sample payloads;
  publishing validates the template against the samples (unknown variable =
  publish rejected).
- **Dead-letter queue**: failed, expired, and unmapped events park in a DLQ
  you can inspect, resend, or discard from the UI.
- **Send log**: 7 days on disk driving the dashboard, every line mirrored to
  stdout for your log shipper.

## Quickstart

```sh
docker run -d --name crier \
  -p 8000:8000 \
  -v ./crier-data:/data \
  -e REDIS_URL=redis://your-redis:6379/0 \
  ghcr.io/bhagyajitjagdev/crier:latest
```

Open http://localhost:8000 — set SMTP under Settings, create an event type,
write a template, publish it, then publish an event:

```
XADD crier:events * data '{"event_id":"demo-1","type":"demo.welcome","to":"you@example.com","cc":[],"payload":{"name":"Ada"},"created_at":"2026-01-01T00:00:00Z"}'
```

Set `AUTH_USERNAME` / `AUTH_PASSWORD` to require a login; leave them unset to
run open (for deployments already gated by a private network).

## Event contract

One stream entry per email, a single `data` field holding JSON:

| Field | Meaning |
|---|---|
| `event_id` | Producer-side unique id. Dedup key: a successfully sent id is skipped for 24h. |
| `type` | Event type, e.g. `workspace.invite`. Must exist in Crier's registry or the event parks as unmapped. |
| `to` | Recipient address. |
| `cc` | Optional list of addresses. |
| `payload` | Flat object of template variables. |
| `created_at` | ISO-8601. Compared against the event type's max age — expired events park instead of sending late (set a max age for OTPs and login links). |

Streams: `crier:events` (consumer group `crier`), `crier:dlq` (parked events).

## Development

```sh
docker compose up -d redis mailpit   # redis on :6380, mailpit UI on :8025
cd backend && uv sync && uv run uvicorn main:app --reload   # api on :8000
cd frontend && npm install && npm run dev                   # ui on :5173, proxies /api
cd backend && uv run python ../scripts/send_test_event.py --to you@example.com
```

Point Settings → SMTP at `localhost:1025` and sent mail appears in Mailpit.

## Configuration

Environment (see `backend/.env.example`): `REDIS_URL` is the only required
setting; `DATA_DIR` (default `/data` in the container), `PORT`,
`AUTH_USERNAME`/`AUTH_PASSWORD` optional. Everything else — SMTP credentials,
sender identity, templates, event types, samples — lives under the data
directory and is edited from the UI without a restart:

```
data/
  templates/draft/      edited in the UI
  templates/published/  what the consumer renders — only publish writes here
  events.json           event type → template, subject, max age, enabled
  samples/<type>.json   sample payload per event type
  config.json           SMTP + from address
  logs/                 JSONL send log, 7-day retention
```

The data directory is safe to keep in git for template history.

## Deploying

`deploy/` has a production example: Crier behind Caddy with automatic TLS and
a bundled Redis. Set `AUTH_USERNAME`/`AUTH_PASSWORD` on any deployment that
is reachable beyond a private network — without them the app runs open by
design.

## License

[MIT](LICENSE). Contribution conventions in [CONTRIBUTING.md](CONTRIBUTING.md).
