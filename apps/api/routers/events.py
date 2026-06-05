"""Event querying, timeline search, and CSV export — all tenant-scoped."""

from __future__ import annotations

import csv
import io
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse

from apps.api.deps import get_tenant_repo
from apps.api.schemas import EventOut
from apps.core.repository import TenantRepository

router = APIRouter(prefix="/events", tags=["events"])


@router.get("", response_model=list[EventOut])
def list_events(
    label: str | None = Query(None, description="case-insensitive substring match"),
    camera_id: int | None = None,
    person_id: int | None = None,
    since: datetime | None = None,
    until: datetime | None = None,
    limit: int = Query(100, ge=1, le=1000),
    repo: TenantRepository = Depends(get_tenant_repo),
):
    return repo.search_events(
        label=label,
        camera_id=camera_id,
        person_id=person_id,
        since=since,
        until=until,
        limit=limit,
    )


@router.get("/export.csv")
def export_events_csv(
    label: str | None = None,
    camera_id: int | None = None,
    person_id: int | None = None,
    since: datetime | None = None,
    until: datetime | None = None,
    limit: int = Query(10000, ge=1, le=100000),
    repo: TenantRepository = Depends(get_tenant_repo),
):
    """Export the (filtered) event history as CSV."""
    rows = repo.search_events(
        label=label,
        camera_id=camera_id,
        person_id=person_id,
        since=since,
        until=until,
        limit=limit,
    )

    def generate():
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(["id", "ts", "label", "score", "camera_id", "person_id", "snapshot_path"])
        yield buf.getvalue()
        buf.seek(0); buf.truncate(0)
        for e in rows:
            writer.writerow([
                e.id,
                e.ts.isoformat() if e.ts else "",
                e.label,
                f"{e.score:.4f}",
                e.camera_id if e.camera_id is not None else "",
                e.person_id if e.person_id is not None else "",
                e.snapshot_path or "",
            ])
            yield buf.getvalue()
            buf.seek(0); buf.truncate(0)

    return StreamingResponse(
        generate(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=events.csv"},
    )
