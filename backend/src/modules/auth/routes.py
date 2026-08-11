import base64
import binascii
import hashlib
import hmac
import time

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel

from config import auth_enabled, settings

COOKIE_NAME = "crier_session"
SESSION_MAX_AGE = 12 * 60 * 60

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _signature(payload: str) -> str:
    return hmac.new(
        settings.session_secret.encode(), payload.encode(), hashlib.sha256
    ).hexdigest()


def create_token(username: str) -> str:
    expires = int(time.time()) + SESSION_MAX_AGE
    # Padding stripped so the value never carries "=", which cookie
    # serialisation would wrap in quotes.
    payload = (
        base64.urlsafe_b64encode(f"{username}:{expires}".encode())
        .decode()
        .rstrip("=")
    )
    return f"{payload}.{_signature(payload)}"


def verify_token(token: str) -> str | None:
    """The signed-in username, or None for a tampered or expired token."""
    payload, _, signature = token.partition(".")
    if not payload or not hmac.compare_digest(signature, _signature(payload)):
        return None
    try:
        decoded = base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4))
        username, _, expires = decoded.decode().rpartition(":")
        if int(expires) < time.time():
            return None
    except (binascii.Error, UnicodeDecodeError, ValueError):
        return None
    return username


def _matches(candidate: str, expected: str) -> bool:
    """Timing-safe; digests are compared so length doesn't leak either."""
    a = hashlib.sha256(candidate.encode()).digest()
    b = hashlib.sha256(expected.encode()).digest()
    return hmac.compare_digest(a, b)


class LoginRequest(BaseModel):
    username: str
    password: str


@router.post("/login")
def login(body: LoginRequest, response: Response):
    if not auth_enabled():
        raise HTTPException(status_code=400, detail="Auth is disabled")

    # Single & so both run — a wrong username costs the same as a wrong password.
    ok = _matches(body.username, settings.auth_username) & _matches(
        body.password, settings.auth_password
    )
    if not ok:
        raise HTTPException(status_code=401, detail="Incorrect username or password")

    response.set_cookie(
        COOKIE_NAME,
        create_token(body.username),
        max_age=SESSION_MAX_AGE,
        httponly=True,
        samesite="lax",
        secure=settings.session_secure,
        path="/",
    )
    return {"ok": True}


# Behind the auth middleware on purpose: SameSite=Lax keeps the cookie off
# cross-site POSTs, so an unauthenticated call can't force anyone out.
@router.post("/logout")
def logout(response: Response):
    response.delete_cookie(COOKIE_NAME, path="/")
    return {"ok": True}


@router.get("/me")
def me(request: Request):
    """Public by necessity — it is what tells the client it is NOT signed in."""
    if not auth_enabled():
        return {"user": None, "authDisabled": True}
    user = verify_token(request.cookies.get(COOKIE_NAME, ""))
    return {"user": user, "authDisabled": False}
