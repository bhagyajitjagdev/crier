# Contributing

Thanks for taking an interest. This is a small project with a few firm
conventions — following them keeps it small.

## Setup

You need Python ≥ 3.13 with [uv](https://docs.astral.sh/uv/), Node ≥ 22, and
Docker for the local Redis + Mailpit stack.

```bash
docker compose up -d redis mailpit   # redis on :6380, mailpit UI on :8025

# backend
cd backend
uv sync
uv run uvicorn main:app --reload     # http://localhost:8000

# frontend (second terminal)
cd frontend
npm install
npm run dev                          # http://localhost:5173, /api proxied to :8000
```

Point Settings → SMTP at `localhost:1025` and every sent email lands in
Mailpit. Publish test events without a producer app:

```bash
cd backend && uv run python ../scripts/send_test_event.py --to you@example.com
```

## Conventions

**Backend** (`backend/`)

- `main.py` and `config.py` stay at the root; features live in
  `src/modules/<feature>/routes.py`, cross-cutting pieces in `src/`
  (`store.py`, `consumer.py`, `sender.py`, `logstore.py`).
- No database. State is files under the data directory plus Redis streams —
  keep it that way. File writes go through the atomic helpers in `store.py`.
- Sends and publishes render with `StrictUndefined`; only previews are
  lenient. Never let a missing variable produce a silently blank email.
- Every consumer outcome appends one JSONL line with a status from the fixed
  enum in `logstore.py`. New behaviors need a status, not a special case.

**Frontend** (`frontend/`)

- Folder-based routes; route files stay thin, UI lives in
  `src/components/<feature>/`.
- Machine data (event types, addresses, timestamps, payloads) is set in mono;
  interface chrome in sans.
- All editor surfaces use the shared `CodeEditor`; colors come from the
  tokens in `styles.css` — no hardcoded palette values in components.

**Verifying a change**

`npm run build && npm run typecheck` must pass, and the flow in the README
(publish event → mail in Mailpit; unmapped/expired/render-failure → DLQ)
must still hold. CI runs the build, a backend import check, and a Docker
image build on every PR.
