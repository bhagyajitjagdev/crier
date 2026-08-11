"""Rejects unauthenticated /api requests before they reach a route.

Enforced globally so protection is the default — a new module is covered the
moment it is mounted, instead of every route having to remember a dependency.
When no credentials are configured the middleware passes everything through:
Crier is designed to run open on a private network and gated elsewhere.
"""

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from config import auth_enabled
from src.modules.auth.routes import COOKIE_NAME, verify_token

# Reachable without a session. Everything else under /api requires one.
PUBLIC_API_PATHS = {"/api/auth/login", "/api/auth/me"}


class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        # Only the API is guarded — the frontend itself must stay reachable
        # so the login page can load at all.
        if (
            not auth_enabled()
            or not path.startswith("/api")
            or path in PUBLIC_API_PATHS
        ):
            return await call_next(request)

        user = verify_token(request.cookies.get(COOKIE_NAME, ""))
        if user is None:
            return JSONResponse({"detail": "Not authenticated"}, status_code=401)

        # Routes read the signed-in user from request.state.user.
        request.state.user = user
        return await call_next(request)
