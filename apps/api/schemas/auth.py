from __future__ import annotations
from pydantic import BaseModel, ConfigDict


class LoginRequest(BaseModel):
    username: str
    password: str
    tenant_id: str | None = None


class RegisterRequest(BaseModel):
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
    username: str = ""


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str
    confirm_password: str


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
