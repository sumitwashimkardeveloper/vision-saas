from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class LoadingConfigIn(BaseModel):
    enabled: bool = False
    source: str = "preset"               # "preset" | "custom" | "both"
    presets: list[str] = []
    customs: list[str] = []
    camera_ids: list[int] = []
    camera_classes: dict[str, list[str]] = {}


class LoadingConfigOut(BaseModel):
    enabled: bool
    source: str
    presets: list[str]
    customs: list[str]
    camera_ids: list[int]
    camera_classes: dict[str, list[str]]
    running_camera_ids: list[int] = []
    updated_at: datetime | None

    model_config = {"from_attributes": True}


class LoadingCountsOut(BaseModel):
    # Cumulative: objects that appeared, were tracked, then disappeared (loaded).
    loaded_count: dict[str, int] = {}      # {object_label: cumulative count}
    # Non-cumulative: objects currently visible/tracked in the latest frame.
    visible_now: dict[str, int] = {}       # {object_label: live count}
    # Most recent loaded object, e.g. {"label": "box", "track_id": 101, "timestamp": "..."}.
    last_event: dict | None = None
    camera_id: int | None = None
    timestamp: str
    mode: str = "exit_visibility_loss"

    model_config = {"extra": "ignore"}
