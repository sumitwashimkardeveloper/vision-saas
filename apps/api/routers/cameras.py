"""Camera CRUD, scoped to the authenticated tenant."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from apps.api.deps import get_tenant_repo
from apps.api.schemas import CameraCreate, CameraOut, CameraUpdate, MessageResult
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


@router.patch("/{camera_id}", response_model=CameraOut)
def update_camera(camera_id: int, body: CameraUpdate, repo: TenantRepository = Depends(get_tenant_repo)):
    """Partial update: name, rtsp_url, and/or enabled flag."""
    cam = repo.get_camera(camera_id)
    if cam is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Camera not found")
    if body.name is not None:
        cam.name = body.name
    if body.rtsp_url is not None:
        cam.rtsp_url = body.rtsp_url
    if body.enabled is not None:
        cam.enabled = body.enabled
    repo.session.add(cam)
    return cam


@router.patch("/{camera_id}/toggle", response_model=CameraOut)
def toggle_camera(camera_id: int, repo: TenantRepository = Depends(get_tenant_repo)):
    """Flip a camera's enabled flag. Returns the updated camera."""
    cam = repo.get_camera(camera_id)
    if cam is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Camera not found")
    cam.enabled = not cam.enabled
    repo.session.add(cam)
    return cam


@router.delete("/{camera_id}", response_model=MessageResult)
def delete_camera(camera_id: int, repo: TenantRepository = Depends(get_tenant_repo)):
    if not repo.delete_camera(camera_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Camera not found")
    return MessageResult(message=f"camera {camera_id} deleted")
