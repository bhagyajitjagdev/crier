"""Serves the built frontend, single-container style.

In development Vite serves the SPA itself and proxies /api here, so this is
a no-op (no build present). In the container the SPA build sits in ./static
and FastAPI serves it: hashed assets cached forever, everything else falling
back to index.html for client-side routing.
"""

import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

STATIC_DIR = Path(
    os.environ.get("STATIC_DIR", Path(__file__).resolve().parent.parent / "static")
)

REVALIDATE = "public, max-age=0, must-revalidate"


class HashedAssets(StaticFiles):
    """Asset filenames carry a content hash, so they can be cached forever."""

    def file_response(self, *args, **kwargs):
        response = super().file_response(*args, **kwargs)
        response.headers["cache-control"] = "public, max-age=31536000, immutable"
        return response


def mount_spa(app: FastAPI) -> None:
    index = STATIC_DIR / "index.html"
    if not index.is_file():
        return

    app.mount("/assets", HashedAssets(directory=STATIC_DIR / "assets"), name="assets")

    root = STATIC_DIR.resolve()

    @app.get("/{path:path}", include_in_schema=False)
    async def spa(path: str):
        # Containment check so "../" can never escape the build directory.
        candidate = (STATIC_DIR / path).resolve()
        if candidate.is_file() and candidate.is_relative_to(root):
            return FileResponse(candidate, headers={"cache-control": REVALIDATE})
        # Any other path is a client-side route — the SPA handles it.
        return FileResponse(index, headers={"cache-control": REVALIDATE})
