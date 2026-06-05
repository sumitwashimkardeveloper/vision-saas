"""The authenticated user's own tenant. Cross-tenant administration (creating or
deleting tenants) stays in the CLI (scripts/manage.py) and is not exposed here,
so the API surface can never read or mutate another tenant."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from apps.api.deps import get_current_user, get_db
from apps.api.schemas import TenantSummaryOut
from apps.core.models import User
from apps.core.tenant_service import tenant_summary

router = APIRouter(prefix="/tenant", tags=["tenant"])


@router.get("/me", response_model=TenantSummaryOut)
def my_tenant(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TenantSummaryOut:
    summary = tenant_summary(db, user.tenant_id)
    if summary is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")
    return TenantSummaryOut(
        id=summary.id,
        name=summary.name,
        people=summary.people,
        cameras=summary.cameras,
        events=summary.events,
    )
