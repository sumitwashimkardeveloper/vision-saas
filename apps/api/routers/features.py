"""PPE feature toggle API, scoped to the authenticated tenant."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from apps.api.deps import get_tenant_repo
from apps.api.schemas import FeatureOut
from apps.core.ppe_registry import PPE_FEATURES, PPE_FEATURES_BY_KEY
from apps.core.repository import TenantRepository

router = APIRouter(prefix="/features", tags=["features"])


@router.get("", response_model=list[FeatureOut])
def list_features(repo: TenantRepository = Depends(get_tenant_repo)):
    """Return all PPE features with their current enabled state for this tenant."""
    repo.ensure_features()
    db_map = {f.feature_key: f.enabled for f in repo.list_features()}
    return [
        FeatureOut(
            key=feat.key,
            label=feat.label,
            description=feat.description,
            enabled=db_map.get(feat.key, False),
        )
        for feat in PPE_FEATURES
    ]


@router.patch("/{feature_key}/toggle", response_model=FeatureOut)
def toggle_feature(
    feature_key: str,
    repo: TenantRepository = Depends(get_tenant_repo),
):
    """Flip a PPE feature's enabled flag. Restart the worker to apply."""
    if feature_key not in PPE_FEATURES_BY_KEY:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Feature not found")
    feat_def = PPE_FEATURES_BY_KEY[feature_key]
    db_feat = repo.toggle_feature(feature_key)
    if db_feat is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Feature not found")
    return FeatureOut(
        key=feat_def.key,
        label=feat_def.label,
        description=feat_def.description,
        enabled=db_feat.enabled,
    )
