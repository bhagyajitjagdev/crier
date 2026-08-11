import secrets

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Redis carrying the event streams — the only setting Crier needs before
    # it can boot. Everything user-facing (SMTP, templates, event types) is
    # edited from the UI and lives under data_dir.
    redis_url: str = "redis://localhost:6379/0"
    data_dir: str = "./data"

    # Optional login. Unset = the app runs open — intended for deployments
    # already gated by a private network.
    auth_username: str = ""
    auth_password: str = ""
    # Signs the session cookie. Random per boot when unset, which signs
    # everyone out on every restart.
    session_secret: str = secrets.token_hex(32)
    # Set true once TLS terminates in front of the app.
    session_secure: bool = False


settings = Settings()


def auth_enabled() -> bool:
    return bool(settings.auth_username and settings.auth_password)


# Stream topology. Producers and the consumer must agree on these names,
# so they are constants rather than configuration.
EVENTS_STREAM = "crier:events"
DLQ_STREAM = "crier:dlq"
CONSUMER_GROUP = "crier"
DEDUP_PREFIX = "crier:dedup:"
DEDUP_TTL_SECONDS = 24 * 60 * 60
DLQ_MAXLEN = 10_000
