"""People enrollment, scoped to the authenticated tenant.

Flow: create a person -> upload one or more face images -> rebuild the gallery.
Images are stored under data/tenants/<tenant>/people/<external_key>/ and the
gallery embeddings cache is recomputed from them.
"""

from __future__ import annotations

import time
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse

from apps.api.deps import get_config, get_current_user, get_tenant_repo
from apps.api.schemas import (
    GalleryRebuildResult,
    MessageResult,
    PersonCreate,
    PersonOut,
)
from apps.core.config import AppConfig
from apps.core.detector import FaceDetector
from apps.core.gallery import build_gallery
from apps.core.models import User
from apps.core.repository import TenantRepository

router = APIRouter(prefix="/people", tags=["people"])

_IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


@router.get("", response_model=list[PersonOut])
def list_people(repo: TenantRepository = Depends(get_tenant_repo)):
    return repo.list_people()


@router.post("", response_model=PersonOut, status_code=status.HTTP_201_CREATED)
def create_person(
    body: PersonCreate,
    repo: TenantRepository = Depends(get_tenant_repo),
    config: AppConfig = Depends(get_config),
    user: User = Depends(get_current_user),
):
    person = repo.upsert_person(body.external_key, body.name, role=body.role, details=body.details)
    # Make the enrollment image folder so the operator/UI can upload into it.
    (config.people_dir(user.tenant_id) / body.external_key).mkdir(parents=True, exist_ok=True)
    return person


@router.post("/{external_key}/images", response_model=MessageResult)
async def upload_image(
    external_key: str,
    file: UploadFile = File(...),
    repo: TenantRepository = Depends(get_tenant_repo),
    config: AppConfig = Depends(get_config),
    user: User = Depends(get_current_user),
):
    if repo.get_person_by_key(external_key) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Person not found")

    ext = Path(file.filename or "").suffix.lower()
    if ext not in _IMAGE_EXTS:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"unsupported image type '{ext}'",
        )

    folder = config.people_dir(user.tenant_id) / external_key
    folder.mkdir(parents=True, exist_ok=True)
    dest = folder / f"{int(time.time() * 1000)}{ext}"
    dest.write_bytes(await file.read())
    return MessageResult(message=f"saved {dest.name} (rebuild the gallery to apply)")


@router.put("/{external_key}/image", response_model=MessageResult)
async def replace_image(
    external_key: str,
    file: UploadFile = File(...),
    repo: TenantRepository = Depends(get_tenant_repo),
    config: AppConfig = Depends(get_config),
    user: User = Depends(get_current_user),
):
    """Replace the person's enrollment image: clear existing ones, save this."""
    if repo.get_person_by_key(external_key) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Person not found")

    ext = Path(file.filename or "").suffix.lower()
    if ext not in _IMAGE_EXTS:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"unsupported image type '{ext}'",
        )

    folder = config.people_dir(user.tenant_id) / external_key
    folder.mkdir(parents=True, exist_ok=True)
    for existing in folder.iterdir():
        if existing.is_file() and existing.suffix.lower() in _IMAGE_EXTS:
            existing.unlink()

    dest = folder / f"{int(time.time() * 1000)}{ext}"
    dest.write_bytes(await file.read())
    return MessageResult(message=f"replaced image with {dest.name} (rebuild the gallery to apply)")


@router.get("/{external_key}/image")
def get_person_image(
    external_key: str,
    repo: TenantRepository = Depends(get_tenant_repo),
    config: AppConfig = Depends(get_config),
    user: User = Depends(get_current_user),
):
    """Return the person's most recently uploaded enrollment image (for previews)."""
    if repo.get_person_by_key(external_key) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Person not found")

    folder = config.people_dir(user.tenant_id) / external_key
    images = (
        sorted(
            (p for p in folder.iterdir() if p.is_file() and p.suffix.lower() in _IMAGE_EXTS),
            key=lambda p: p.stat().st_mtime,
        )
        if folder.exists()
        else []
    )
    if not images:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No image for this person")
    # Newest image last after the mtime sort.
    return FileResponse(str(images[-1]))


@router.delete("/{external_key}", response_model=MessageResult)
def delete_person(external_key: str, repo: TenantRepository = Depends(get_tenant_repo)):
    if not repo.delete_person(external_key):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Person not found")
    return MessageResult(message=f"person '{external_key}' deleted")


@router.post("/gallery/rebuild", response_model=GalleryRebuildResult)
def rebuild_gallery(
    config: AppConfig = Depends(get_config),
    user: User = Depends(get_current_user),
):
    """Recompute the tenant's embeddings cache from enrolled images.

    Note: this loads the ArcFace model in the API process and runs synchronously,
    which is fine for a local admin tool but blocks the request while it runs.
    """
    detector = FaceDetector(config.recognition)
    gallery = build_gallery(config, user.tenant_id, detector)
    return GalleryRebuildResult(tenant_id=user.tenant_id, people_enrolled=gallery.size)
