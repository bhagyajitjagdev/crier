from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, model_validator

from src import sender
from src.store import store

router = APIRouter(prefix="/api/settings", tags=["settings"])

MASK = "••••••••"


class SMTPBody(BaseModel):
    host: str
    port: int = 1025
    username: str = ""
    # None (or the mask echoed back) keeps the stored password; "" clears it.
    password: str | None = None
    use_tls: bool = False
    start_tls: bool = False

    @model_validator(mode="after")
    def tls_modes_exclusive(self):
        if self.use_tls and self.start_tls:
            raise ValueError("use_tls (implicit TLS) and start_tls are exclusive")
        return self


class ConfigBody(BaseModel):
    from_address: str = ""
    from_name: str = "Crier"
    smtp: SMTPBody


@router.get("")
def get_settings():
    """The stored config with the password masked — the secret itself never
    leaves the backend."""
    cfg = store.get_config()
    smtp = cfg["smtp"]
    return {
        **cfg,
        "smtp": {
            **smtp,
            "password": MASK if smtp["password"] else "",
            "password_set": bool(smtp["password"]),
        },
    }


@router.put("")
def put_settings(body: ConfigBody):
    cfg = body.model_dump()
    if cfg["smtp"]["password"] in (None, MASK):
        cfg["smtp"]["password"] = store.get_config()["smtp"]["password"]
    store.save_config(cfg)
    return get_settings()


class TestBody(BaseModel):
    # When set, a real test email is sent there instead of just connecting.
    to: str | None = None


@router.post("/test")
async def test_settings(body: TestBody):
    config = store.get_config()
    if body.to and not config["from_address"]:
        raise HTTPException(status_code=400, detail="Set a from address first")
    try:
        if body.to:
            await sender.send_email(
                config,
                to=body.to,
                cc=[],
                subject="Crier test email",
                html="<p>Crier can reach your SMTP server and send email.</p>",
            )
        else:
            await sender.test_connection(config)
        return {"ok": True}
    except Exception as error:  # DNS, refused, bad login — report, don't 500
        return {"ok": False, "error": str(error)}
