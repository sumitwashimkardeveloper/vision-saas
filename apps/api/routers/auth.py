"""Authentication: log in as a tenant admin and receive a JWT."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from apps.api.deps import get_config, get_db
from apps.api.schemas import LoginRequest, TokenResponse
from apps.api.security import create_access_token
from apps.core.config import AppConfig
from apps.core.user_service import authenticate

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(
    body: LoginRequest,
    db: Session = Depends(get_db),
    config: AppConfig = Depends(get_config),
) -> TokenResponse:
    user = authenticate(db, body.tenant_id, body.username, body.password)
    if user is None:
        # Same response for unknown user / wrong tenant / bad password.
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    token = create_access_token(config.auth, user.id, user.tenant_id, user.role)
    return TokenResponse(access_token=token, tenant_id=user.tenant_id, role=user.role)
