import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI

from config import auth_enabled
from src.consumer import consumer
from src.logstore import sendlog
from src.middleware.auth import AuthMiddleware
from src.modules.auth.routes import router as auth_router
from src.modules.events.routes import router as events_router
from src.modules.logs.routes import router as logs_router
from src.modules.settings.routes import router as settings_router
from src.modules.templates.routes import router as templates_router
from src.spa import mount_spa

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("crier")


@asynccontextmanager
async def lifespan(app: FastAPI):
    sendlog.purge()
    consumer.start()
    yield
    await consumer.stop()


app = FastAPI(title="Crier API", lifespan=lifespan)
app.add_middleware(AuthMiddleware)

app.include_router(auth_router)
app.include_router(settings_router)
app.include_router(templates_router)
app.include_router(events_router)
app.include_router(logs_router)

if not auth_enabled():
    logger.warning(
        "AUTH_USERNAME/AUTH_PASSWORD not set — running open. Fine on a "
        "private network; set both to require a login."
    )


@app.get("/health")
async def health():
    try:
        await consumer.redis.ping()
        redis_ok = True
    except Exception:
        redis_ok = False
    beat = consumer.last_beat
    stale = (
        beat is None
        or (datetime.now(timezone.utc) - beat).total_seconds() > 30
    )
    return {
        "status": "ok" if redis_ok and not stale else "degraded",
        "redis": redis_ok,
        "consumer_alive": not stale,
        "last_beat": beat.isoformat() if beat else None,
    }


mount_spa(app)
