from __future__ import annotations
from pydantic import BaseModel, ConfigDict


class CameraCreate(BaseModel):
    name: str
    rtsp_url: str
    enabled: bool = True


class CameraOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    rtsp_url: str
    enabled: bool
