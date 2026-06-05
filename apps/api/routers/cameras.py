"""Camera CRUD, scoped to the authenticated tenant."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from apps.api.deps import get_tenant_repo
from apps.api.schemas import CameraCreate, CameraOut, MessageResult
from apps.core.repository import TenantRepository

router = APIRouter(prefix="/cameras", tags=["cameras"])


@router.get("", response_model=list[CameraOut])
def list_cameras(
    enabled_only: bool = False,
    repo: TenantRepository = Depends(get_tenant_repo),
):
    return repo.list_cameras(enabled_only=enabled_only)


@router.post("", response_model=CameraOut, status_code=status.HTTP_201_CREATED)
def create_camera(body: CameraCreate, repo: TenantRepository = Depends(get_tenant_repo)):
    # upsert by (tenant, name): re-POSTing the same name updates the URL/enabled flag.
    return repo.upsert_camera(body.name, body.rtsp_url, enabled=body.enabled)


@router.delete("/{camera_id}", response_model=MessageResult)
def delete_camera(camera_id: int, repo: TenantRepository = Depends(get_tenant_repo)):
    if not repo.delete_camera(camera_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Camera not found")
    return MessageResult(message=f"camera {camera_id} deleted")
