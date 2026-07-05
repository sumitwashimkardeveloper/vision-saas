from __future__ import annotations
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

PersonCategory = Literal["general", "staff", "vip", "blocked", "security_staff", "management"]


class PersonCreate(BaseModel):
    external_key: str = Field(..., description="stable slug; matches the on-disk folder name")
    name: str
    category: PersonCategory = "general"
    role: str | None = None
    details: str | None = None


class PersonUpdate(BaseModel):
    name: str | None = None
    category: PersonCategory | None = None
    role: str | None = None
    details: str | None = None


class PersonOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    external_key: str
    name: str
    category: str = "general"
    role: str | None = None
    details: str | None = None


class GalleryRebuildResult(BaseModel):
    tenant_id: str
    people_enrolled: int
    enrolled_names: list[str] = []   # display names successfully enrolled
    failed_names: list[str] = []     # display names where no face was detected
