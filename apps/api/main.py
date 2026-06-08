"""FastAPI application for the local, offline face-recognition admin API.

All data endpoints are scoped to the authenticated tenant (see apps/api/deps.py).
Run locally with:
    uvicorn apps.api.main:app --host 127.0.0.1 --port 8000
Interactive docs at http://127.0.0.1:8000/docs
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles

from apps.api.deps import get_config
from apps.api.routers import auth, cameras, events, meta, people, stream, tenant, worker
from apps.core.db import ensure_schema

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create/upgrade the DB schema on startup so a fresh install can register a
    # tenant from the dashboard without a separate init_db step.
    ensure_schema(get_config())
    yield


app = FastAPI(
    title="Offline Multi-Tenant Face Recognition API",
    version="0.5.0",
    description="Local admin API + dashboard: auth, cameras, people, events (tenant-scoped).",
    lifespan=lifespan,
)

app.include_router(meta.router)
app.include_router(auth.router)
app.include_router(tenant.router)
app.include_router(cameras.router)
app.include_router(people.router)
app.include_router(events.router)
app.include_router(worker.router)
app.include_router(stream.router)

# Phase 5: serve the static admin dashboard at /ui (index.html). Visiting / redirects there.
_STATIC_DIR = Path(__file__).parent / "static"
app.mount("/ui", StaticFiles(directory=str(_STATIC_DIR), html=True), name="ui")


@app.get("/", include_in_schema=False)
def root() -> RedirectResponse:
    return RedirectResponse(url="/ui/")
