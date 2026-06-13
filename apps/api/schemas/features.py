from __future__ import annotations
from pydantic import BaseModel, Field


class FeatureOut(BaseModel):
    key: str
    label: str
    description: str
    enabled: bool
    # Camera IDs this feature applies to. Empty = inactive (no cameras selected).
    camera_ids: list[int] = Field(default_factory=list)


class FeatureCamerasIn(BaseModel):
    camera_ids: list[int] = Field(default_factory=list)
