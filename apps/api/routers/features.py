"""Feature toggle + per-camera assignment API, scoped to the authenticated tenant."""

from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException, status

from apps.api.deps import get_tenant_repo
from apps.api.schemas import FeatureCamerasIn, FeatureOut
from apps.core.ppe_registry import (
    OTHER_FEATURES,
    OTHER_FEATURES_BY_KEY,
    PPE_FEATURES,
    PPE_FEATURES_BY_KEY,
)
from apps.core.repository import TenantRepository

router = APIRouter(prefix="/features", tags=["features"])

# All toggleable features (PPE + non-PPE) keyed for lookup/validation.
_ALL_DEFS = [*PPE_FEATURES, *OTHER_FEATURES]
_ALL_BY_KEY = {**PPE_FEATURES_BY_KEY, **OTHER_FEATURES_BY_KEY}


def _parse_camera_ids(raw: str | None) -> list[int]:
    try:
        return list(json.loads(raw or "[]"))
    except (ValueError, TypeError):
        return []


@router.get("", response_model=list[FeatureOut])
def list_features(repo: TenantRepository = Depends(get_tenant_repo)):
    """Return all features with their current enabled state and camera assignment."""
    repo.ensure_features()
    rows = {f.feature_key: f for f in repo.list_features()}
    out = []
    for feat in _ALL_DEFS:
        row = rows.get(feat.key)
        out.append(
            FeatureOut(
                key=feat.key,
                label=feat.label,
                description=feat.description,
                enabled=bool(row.enabled) if row else False,
                camera_ids=_parse_camera_ids(row.camera_ids) if row else [],
            )
        )
    return out


@router.patch("/{feature_key}/toggle", response_model=FeatureOut)
def toggle_feature(
    feature_key: str,
    repo: TenantRepository = Depends(get_tenant_repo),
):
    """Flip a feature's enabled flag. Takes effect within ~30 s in the running worker."""
    if feature_key not in _ALL_BY_KEY:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Feature not found")
    feat_def = _ALL_BY_KEY[feature_key]
    db_feat = repo.toggle_feature(feature_key)
    if db_feat is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Feature not found")
    return FeatureOut(
        key=feat_def.key,
        label=feat_def.label,
        description=feat_def.description,
        enabled=db_feat.enabled,
        camera_ids=_parse_camera_ids(db_feat.camera_ids),
    )


@router.put("/{feature_key}/cameras", response_model=FeatureOut)
def set_feature_cameras(
    feature_key: str,
    payload: FeatureCamerasIn,
    repo: TenantRepository = Depends(get_tenant_repo),
):
    """Set the cameras a feature applies to. Empty list = inactive (no cameras)."""
    if feature_key not in _ALL_BY_KEY:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Feature not found")
    feat_def = _ALL_BY_KEY[feature_key]
    db_feat = repo.set_feature_cameras(feature_key, payload.camera_ids)
    if db_feat is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Feature not found")
    return FeatureOut(
        key=feat_def.key,
        label=feat_def.label,
        description=feat_def.description,
        enabled=db_feat.enabled,
        camera_ids=_parse_camera_ids(db_feat.camera_ids),
    )
