"""JWT access tokens for the local API.

HS256 signed with the configured secret. Tokens carry the user id, tenant id,
and role so request handlers can scope data access without another DB lookup
for identity (the user row is still loaded to confirm the account is active).
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import jwt

from apps.core.config import AuthConfig


def create_access_token(auth: AuthConfig, user_id: int, tenant_id: str, role: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "tenant_id": tenant_id,
        "role": role,
        "iat": now,
        "exp": now + timedelta(minutes=auth.access_token_expire_minutes),
    }
    return jwt.encode(payload, auth.secret_key, algorithm=auth.algorithm)


def decode_access_token(auth: AuthConfig, token: str) -> dict:
    """Decode and validate a token. Raises jwt.PyJWTError on any problem."""
    return jwt.decode(token, auth.secret_key, algorithms=[auth.algorithm])
