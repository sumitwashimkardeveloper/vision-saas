from __future__ import annotations
from pydantic import BaseModel, ConfigDict


class CameraCreate(BaseModel):
    name: str
    rtsp_url: str
    enabled: bool = True


class CameraUpdate(BaseModel):
    name: str | None = None
    rtsp_url: str | None = None
    enabled: bool | None = None


class CameraOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    rtsp_url: str
    enabled: bool
