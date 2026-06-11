from __future__ import annotations
from pydantic import BaseModel


class FeatureOut(BaseModel):
    key: str
    label: str
    description: str
    enabled: bool
