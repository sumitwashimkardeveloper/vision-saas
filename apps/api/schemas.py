"""Pydantic request/response models for the API."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class LoginRequest(BaseModel):
    username: str
    password: str
    # Optional: legacy tenant-scoped login still works if supplied. The dashboard
    # logs in with username + password only (usernames are globally unique).
    tenant_id: str | None = None


class RegisterRequest(BaseModel):
    """Self-service signup: creates a tenant and its first admin together.

    Field-level rules are enforced in the auth router so error messages are
    plain strings (mirrored by the frontend)."""
    tenant_name: str
    tenant_id: str
    username: str
    password: str
    confirm_password: str
    accept_terms: bool = False


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    tenant_id: str
    role: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    tenant_id: str
    username: str
    role: str
    is_active: bool


class TenantOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str


class TenantSummaryOut(BaseModel):
    id: str
    name: str
    people: int
    cameras: int
    events: int


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


class EventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    label: str
    score: float
    camera_id: int | None = None
    person_id: int | None = None
    snapshot_path: str | None = None
    ts: datetime


class GalleryRebuildResult(BaseModel):
    tenant_id: str
    people_enrolled: int


class MessageResult(BaseModel):
    message: str
