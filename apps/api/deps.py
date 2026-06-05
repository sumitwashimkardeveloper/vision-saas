"""FastAPI dependencies: config, DB session, authenticated user, tenant repo.

The auth chain is the heart of Phase 3: a valid token resolves to a User, and
all data access flows through a TenantRepository bound to that user's tenant_id.
A handler therefore *cannot* read another tenant's data even if it tried.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Iterator

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from apps.core.config import AppConfig, load_config
from apps.core.db import get_session_factory
from apps.core.models import User
from apps.core.repository import TenantRepository
from apps.api.security import decode_access_token

_bearer = HTTPBearer(auto_error=True)


@lru_cache
def get_config() -> AppConfig:
    return load_config()


def get_db(config: AppConfig = Depends(get_config)) -> Iterator[Session]:
    session = get_session_factory(config)()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def get_current_user(
    creds: HTTPAuthorizationCredentials = Depends(_bearer),
    config: AppConfig = Depends(get_config),
    db: Session = Depends(get_db),
) -> User:
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired token",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_access_token(config.auth, creds.credentials)
        user_id = int(payload["sub"])
        tenant_id = payload["tenant_id"]
    except (jwt.PyJWTError, KeyError, ValueError):
        raise unauthorized

    user = db.get(User, user_id)
    # Reject if the user is gone, deactivated, or the token's tenant no longer
    # matches the account (defense in depth against tampered/stale tokens).
    if user is None or not user.is_active or user.tenant_id != tenant_id:
        raise unauthorized
    return user


def get_tenant_repo(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TenantRepository:
    return TenantRepository(db, user.tenant_id)
