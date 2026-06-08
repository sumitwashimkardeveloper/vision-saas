"""Authentication: self-service signup and login, both returning a JWT."""

from __future__ import annotations

import re

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from apps.api.deps import get_config, get_current_user, get_db
from apps.api.schemas import ChangePasswordRequest, LoginRequest, MessageResult, RegisterRequest, TokenResponse
from apps.api.security import create_access_token
from apps.core.config import AppConfig
from apps.core.models import Tenant, User
from apps.core.security import hash_password, verify_password
from apps.core.tenant_service import create_tenant
from apps.core.user_service import (
    authenticate,
    authenticate_global,
    create_user,
    username_taken,
)

router = APIRouter(prefix="/auth", tags=["auth"])

# Slugs used as a tenant id / username: filesystem- and URL-safe.
_SLUG = re.compile(r"^[A-Za-z0-9_-]+$")
_MIN_PASSWORD = 8
_MIN_USERNAME = 3


def _bad_request(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)


def _validate_registration(body: RegisterRequest) -> tuple[str, str, str, str]:
    """Validate + normalize the signup payload. Returns the cleaned fields.

    These checks are the authoritative ones; the frontend mirrors them only for
    instant feedback. Raises 400 with a plain message on the first problem."""
    tenant_name = (body.tenant_name or "").strip()
    tenant_id = (body.tenant_id or "").strip()
    username = (body.username or "").strip()
    password = body.password or ""

    if not tenant_name:
        raise _bad_request("Organization name is required")
    if not tenant_id:
        raise _bad_request("Tenant ID is required")
    if not _SLUG.match(tenant_id):
        raise _bad_request("Tenant ID may only contain letters, numbers, '-' and '_'")
    if len(tenant_id) > 64:
        raise _bad_request("Tenant ID is too long (max 64 characters)")
    if not username:
        raise _bad_request("Username is required")
    if len(username) < _MIN_USERNAME:
        raise _bad_request(f"Username must be at least {_MIN_USERNAME} characters")
    if not _SLUG.match(username):
        raise _bad_request("Username may only contain letters, numbers, '-' and '_'")
    if len(password) < _MIN_PASSWORD:
        raise _bad_request(f"Password must be at least {_MIN_PASSWORD} characters")
    if password != body.confirm_password:
        raise _bad_request("Passwords do not match")
    if not body.accept_terms:
        raise _bad_request("You must accept the Terms & Privacy Policy")

    return tenant_name, tenant_id, username, password


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(
    body: RegisterRequest,
    db: Session = Depends(get_db),
    config: AppConfig = Depends(get_config),
) -> TokenResponse:
    tenant_name, tenant_id, username, password = _validate_registration(body)

    if db.get(Tenant, tenant_id) is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="That Tenant ID is already taken")
    if username_taken(db, username):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="That username is already taken")

    # Create the tenant and its first admin in one transaction (get_db commits on
    # success and rolls back if anything below raises).
    create_tenant(config, db, tenant_id, tenant_name)
    user = create_user(db, tenant_id, username, password, role="admin")
    token = create_access_token(config.auth, user.id, user.tenant_id, user.role)
    return TokenResponse(access_token=token, tenant_id=user.tenant_id, role=user.role, username=user.username)


@router.post("/login", response_model=TokenResponse)
def login(
    body: LoginRequest,
    db: Session = Depends(get_db),
    config: AppConfig = Depends(get_config),
) -> TokenResponse:
    if body.tenant_id:
        user = authenticate(db, body.tenant_id, body.username, body.password)
    else:
        user = authenticate_global(db, body.username, body.password)
    if user is None:
        # Same response for unknown user / wrong tenant / bad password.
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    token = create_access_token(config.auth, user.id, user.tenant_id, user.role)
    return TokenResponse(access_token=token, tenant_id=user.tenant_id, role=user.role, username=user.username)


@router.patch("/me/password", response_model=MessageResult)
def change_password(
    body: ChangePasswordRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MessageResult:
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect")
    if len(body.new_password) < 8:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="New password must be at least 8 characters")
    if body.new_password != body.confirm_password:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Passwords do not match")
    user.password_hash = hash_password(body.new_password)
    db.add(user)
    return MessageResult(message="Password updated successfully")
