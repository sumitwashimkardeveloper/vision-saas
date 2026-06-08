from __future__ import annotations
from datetime import datetime
from pydantic import BaseModel, ConfigDict


class EventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    label: str
    score: float
    camera_id: int | None = None
    person_id: int | None = None
    snapshot_path: str | None = None
    ts: datetime
