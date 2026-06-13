"""PPE feature registry: maps frontend feature keys to YOLO class names.

Feature keys must match exactly what FeaturesPage.jsx uses (e.g. 'helmet_detection').
yolo_classes lists the YOLO output class name(s) that satisfy that feature.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class PPEFeatureDef:
    key: str            # frontend toggle key, stored in tenant_features
    label: str          # human-readable display name
    description: str
    yolo_classes: tuple[str, ...]  # YOLO class names that count as this feature


PPE_FEATURES: list[PPEFeatureDef] = [
    PPEFeatureDef("helmet_detection",     "Helmet",        "Hard hat / safety helmet",       ("helmet",)),
    PPEFeatureDef("vest_detection",       "Safety Vest",   "High-visibility reflective vest", ("vest",)),
    PPEFeatureDef("gloves_detection",     "Gloves",        "Protective safety gloves",        ("gloves",)),
    PPEFeatureDef("goggles_detection",    "Goggles",       "Protective eye goggles",          ("goggles",)),
    PPEFeatureDef("mask_detection",       "Face Mask",     "Protective face mask",            ("mask",)),
]

PPE_FEATURE_KEYS: list[str] = [f.key for f in PPE_FEATURES]
PPE_FEATURES_BY_KEY: dict[str, PPEFeatureDef] = {f.key: f for f in PPE_FEATURES}


# ── Non-PPE features that still use the generic tenant_features toggle table ──
# These have no YOLO classes; they gate other pipelines (e.g. face recognition).

FACE_RECOGNITION_KEY = "face_recognition"


@dataclass(frozen=True)
class FeatureDef:
    key: str
    label: str
    description: str


OTHER_FEATURES: list[FeatureDef] = [
    FeatureDef(
        FACE_RECOGNITION_KEY,
        "Face Recognition",
        "Detect and match enrolled people across all cameras",
    ),
]
OTHER_FEATURES_BY_KEY: dict[str, FeatureDef] = {f.key: f for f in OTHER_FEATURES}

# Every feature key persisted in the tenant_features table (PPE + others).
# ensure_features() uses this to seed new rows and prune stale ones.
ALL_FEATURE_KEYS: list[str] = PPE_FEATURE_KEYS + [f.key for f in OTHER_FEATURES]
