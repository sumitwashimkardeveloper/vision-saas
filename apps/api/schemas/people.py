from __future__ import annotations
from pydantic import BaseModel, ConfigDict, Field


class PersonCreate(BaseModel):
    external_key: str = Field(..., description="stable slug; matches the on-disk folder name")
    name: str
    role: str | None = None
    details: str | None = None


class PersonOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    external_key: str
    name: str
    role: str | None = None
    details: str | None = None


class GalleryRebuildResult(BaseModel):
    tenant_id: str
    people_enrolled: int
