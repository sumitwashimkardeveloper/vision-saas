"""Tenant lifecycle management (Phase 2).

These are *admin* operations that create or destroy tenants and summarize them.
Unlike TenantRepository (which is scoped to a single tenant and used for normal
data access), these functions operate across tenants by design and are the only
place a tenant comes into or goes out of existence. The Phase 3 API will call
these behind admin auth.
"""

from __future__ import annotations

import logging
import shutil
from dataclasses import dataclass
from typing import Sequence

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .config import AppConfig
from .models import Camera, Event, Person, Tenant

logger = logging.getLogger(__name__)


@dataclass
class TenantSummary:
    id: str
    name: str
    people: int
    cameras: int
    events: int


def list_tenants(session: Session) -> Sequence[Tenant]:
    return session.scalars(select(Tenant).order_by(Tenant.id)).all()


def create_tenant(config: AppConfig, session: Session, tenant_id: str, name: str | None = None) -> Tenant:
    """Create a tenant row (if absent) and its on-disk folder layout."""
    tenant = session.get(Tenant, tenant_id)
    if tenant is None:
        tenant = Tenant(id=tenant_id, name=name or tenant_id)
        session.add(tenant)
        session.flush()
        logger.info("created tenant '%s'", tenant_id)
    elif name and tenant.name != name:
        tenant.name = name
    config.ensure_tenant_dirs(tenant_id)
    return tenant


def delete_tenant(
    config: AppConfig, session: Session, tenant_id: str, purge_files: bool = True
) -> bool:
    """Delete a tenant and all its data. Returns False if it didn't exist.

    The DB cascade removes cameras/people/events; ``purge_files`` also removes
    the tenant's images, embeddings, and snapshots from disk.
    """
    tenant = session.get(Tenant, tenant_id)
    if tenant is None:
        return False
    session.delete(tenant)  # cascades to cameras/people/events
    session.flush()
    if purge_files:
        for path in (config.tenant_dir(tenant_id), config.snapshots_dir(tenant_id)):
            shutil.rmtree(path, ignore_errors=True)
    logger.info("deleted tenant '%s' (purge_files=%s)", tenant_id, purge_files)
    return True


def tenant_summary(session: Session, tenant_id: str) -> TenantSummary | None:
    tenant = session.get(Tenant, tenant_id)
    if tenant is None:
        return None

    def _count(model) -> int:
        return session.scalar(
            select(func.count()).select_from(model).where(model.tenant_id == tenant_id)
        ) or 0

    return TenantSummary(
        id=tenant.id,
        name=tenant.name,
        people=_count(Person),
        cameras=_count(Camera),
        events=_count(Event),
    )
