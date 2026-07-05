from __future__ import annotations
from datetime import datetime
from pydantic import BaseModel, ConfigDict


class EventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    event_type: str
    feature_type: str
    label: str
    score: float
    confidence: float
    camera_id: int | None = None
    camera_name: str | None = None
    person_id: int | None = None
    person_name: str | None = None
    object_label: str | None = None
    has_snapshot: bool
    snapshot_url: str | None = None
    ts: datetime
    details: dict | None = None
