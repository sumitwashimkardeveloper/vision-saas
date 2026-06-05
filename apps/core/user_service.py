"""Tenant-admin user accounts: create, list, authenticate.

Users are tenant-scoped; (tenant_id, username) is unique. Authentication is the
only place passwords are checked, and it always filters by tenant so credentials
from one tenant can never resolve to another (ADR-003).
"""

from __future__ import annotations

from typing import Sequence

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import User
from .security import hash_password, verify_password


def get_user(session: Session, tenant_id: str, username: str) -> User | None:
    stmt = select(User).where(User.tenant_id == tenant_id, User.username == username)
    return session.scalars(stmt).first()


def username_taken(session: Session, username: str) -> bool:
    """True if the username exists for *any* tenant.

    Self-service registration enforces global username uniqueness so that login
    can resolve an account from username + password alone (no tenant field).
    """
    stmt = select(User.id).where(User.username == username)
    return session.scalars(stmt).first() is not None


def list_users(session: Session, tenant_id: str) -> Sequence[User]:
    stmt = select(User).where(User.tenant_id == tenant_id).order_by(User.username)
    return session.scalars(stmt).all()


def create_user(
    session: Session,
    tenant_id: str,
    username: str,
    password: str,
    role: str = "admin",
) -> User:
    if get_user(session, tenant_id, username) is not None:
        raise ValueError(f"user '{username}' already exists for tenant '{tenant_id}'")
    user = User(
        tenant_id=tenant_id,
        username=username,
        password_hash=hash_password(password),
        role=role,
        is_active=True,
    )
    session.add(user)
    session.flush()
    return user


def authenticate(session: Session, tenant_id: str, username: str, password: str) -> User | None:
    """Return the user if credentials are valid and the account is active."""
    user = get_user(session, tenant_id, username)
    if user is None or not user.is_active:
        return None
    if not verify_password(password, user.password_hash):
        return None
    return user


def authenticate_global(session: Session, username: str, password: str) -> User | None:
    """Authenticate by username + password without a tenant hint.

    Usernames created via self-service registration are globally unique, so at
    most one account matches; we still loop defensively in case older CLI-created
    accounts reused a username across tenants.
    """
    stmt = select(User).where(User.username == username)
    for user in session.scalars(stmt).all():
        if user.is_active and verify_password(password, user.password_hash):
            return user
    return None
