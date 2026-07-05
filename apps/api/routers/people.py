"""People enrollment, scoped to the authenticated tenant.

Flow: create a person -> upload one or more face images.
The gallery is rebuilt automatically after every image upload, replace, or delete.
"""

from __future__ import annotations

import shutil
import time
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse, JSONResponse

from apps.api.deps import get_config, get_current_user, get_tenant_repo
from apps.api.schemas import (
    GalleryRebuildResult,
    MessageResult,
    PersonCreate,
    PersonOut,
    PersonUpdate,
)
from apps.core.config import AppConfig
from apps.core.detector import FaceDetector
from apps.core.gallery import build_gallery
from apps.core.models import User
from apps.core.repository import TenantRepository

router = APIRouter(prefix="/people", tags=["people"])

_IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}

# One shared detector instance per API process — lazy-loads ONNX on first use.
_detector: FaceDetector | None = None


def _get_detector(config: AppConfig) -> FaceDetector:
    global _detector
    if _detector is None:
        _detector = FaceDetector(config.recognition)
    return _detector


def _auto_rebuild(config: AppConfig, tenant_id: str) -> None:
    """Rebuild the gallery in the background of the current request."""
    build_gallery(config, tenant_id, _get_detector(config))


@router.get("", response_model=list[PersonOut])
def list_people(repo: TenantRepository = Depends(get_tenant_repo)):
    people = [
        PersonOut.model_validate(person).model_dump()
        for person in repo.list_people()
    ]
    return JSONResponse(
        people,
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
            "Expires": "0",
        },
    )


@router.post("", response_model=PersonOut, status_code=status.HTTP_201_CREATED)
def create_person(
    body: PersonCreate,
    repo: TenantRepository = Depends(get_tenant_repo),
    config: AppConfig = Depends(get_config),
    user: User = Depends(get_current_user),
):
    person = repo.upsert_person(
        body.external_key,
        body.name,
        category=body.category,
        role=body.role,
        details=body.details,
    )
    (config.people_dir(user.tenant_id) / body.external_key).mkdir(parents=True, exist_ok=True)
    return person


@router.patch("/{external_key}", response_model=PersonOut)
def update_person(
    external_key: str,
    body: PersonUpdate,
    repo: TenantRepository = Depends(get_tenant_repo),
    config: AppConfig = Depends(get_config),
    user: User = Depends(get_current_user),
):
    person = repo.get_person_by_key(external_key)
    if person is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Person not found")

    if body.name is not None:
        person.name = body.name
    if body.category is not None:
        person.category = body.category
    if body.role is not None:
        person.role = body.role
    if body.details is not None:
        person.details = body.details
    repo.session.add(person)

    _auto_rebuild(config, user.tenant_id)
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

    _auto_rebuild(config, user.tenant_id)
    return MessageResult(message=f"saved {dest.name} — gallery updated")


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

    _auto_rebuild(config, user.tenant_id)
    return MessageResult(message=f"replaced image with {dest.name} — gallery updated")


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
    return FileResponse(
        str(images[-1]),
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
            "Expires": "0",
        },
    )


@router.delete("/{external_key}", response_model=MessageResult)
def delete_person(
    external_key: str,
    repo: TenantRepository = Depends(get_tenant_repo),
    config: AppConfig = Depends(get_config),
    user: User = Depends(get_current_user),
):
    if not repo.delete_person(external_key):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Person not found")

    # Remove their image folder from disk.
    folder = config.people_dir(user.tenant_id) / external_key
    if folder.exists():
        shutil.rmtree(folder, ignore_errors=True)

    _auto_rebuild(config, user.tenant_id)
    return MessageResult(message=f"person '{external_key}' deleted — gallery updated")


@router.post("/gallery/rebuild", response_model=GalleryRebuildResult)
def rebuild_gallery(
    config: AppConfig = Depends(get_config),
    user: User = Depends(get_current_user),
):
    """Manually recompute the tenant's embeddings cache. Usually not needed."""
    result = build_gallery(config, user.tenant_id, _get_detector(config))
    return GalleryRebuildResult(
        tenant_id=user.tenant_id,
        people_enrolled=result.gallery.size,
        enrolled_names=result.enrolled,
        failed_names=result.failed,
    )
