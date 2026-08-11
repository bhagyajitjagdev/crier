FROM node:22-alpine AS web
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM ghcr.io/astral-sh/uv:python3.13-alpine AS runtime
WORKDIR /app
ENV UV_COMPILE_BYTECODE=1

COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev

COPY backend/ ./
COPY --from=web /app/dist ./static

RUN adduser -D crier && mkdir -p /data && chown crier /data
USER crier

ENV PORT=8000 DATA_DIR=/data
VOLUME /data
EXPOSE 8000

# Fails on degraded too — a dead consumer or unreachable Redis must show as
# unhealthy, not just a dead HTTP server.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD /app/.venv/bin/python -c "import os,sys,json,urllib.request;d=json.load(urllib.request.urlopen(f'http://127.0.0.1:{os.environ.get(\"PORT\",8000)}/health'));sys.exit(0 if d.get('status')=='ok' else 1)" || exit 1

CMD ["sh", "-c", "/app/.venv/bin/uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
