"""PPE feature registry: canonical list of detectable PPE items.

Each PPEFeatureDef maps a feature key (used in the DB and API) to the YOLO
class names that represent that item across common public PPE datasets.
The matching is case-insensitive and checked against yolo_classes at
PPEDetector construction time.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class PPEFeatureDef:
    key: str
    label: str
    description: str
    # YOLO class name variants to match (case-insensitive)
    yolo_classes: tuple[str, ...]


PPE_FEATURES: list[PPEFeatureDef] = [
    PPEFeatureDef(
        "helmet",
        "Helmet",
        "Hard hat / safety helmet",
        ("hardhat", "helmet", "hard-hat", "hard hat", "safety helmet"),
    ),
    PPEFeatureDef(
        "safety_vest",
        "Safety Vest",
        "High-visibility safety vest",
        ("safety vest", "vest", "safety-vest", "hi-vis", "high visibility vest"),
    ),
    PPEFeatureDef(
        "face_mask",
        "Face Mask",
        "Protective face mask",
        ("mask", "face mask", "face-mask", "respirator"),
    ),
    PPEFeatureDef(
        "gloves",
        "Gloves",
        "Safety / protective gloves",
        ("gloves", "glove", "safety gloves"),
    ),
    PPEFeatureDef(
        "safety_goggles",
        "Safety Goggles",
        "Protective eye goggles",
        ("goggles", "safety goggles", "eye protection", "glasses"),
    ),
    PPEFeatureDef(
        "safety_shoes",
        "Safety Shoes",
        "Steel-toe / safety footwear",
        ("boots", "safety shoes", "safety boots", "shoes", "safety footwear"),
    ),
    PPEFeatureDef(
        "full_body_suit",
        "Full Body Suit",
        "Protective full-body coverall",
        ("coverall", "full body suit", "full-body suit", "suit", "coveralls"),
    ),
]

PPE_FEATURE_KEYS: list[str] = [f.key for f in PPE_FEATURES]
PPE_FEATURES_BY_KEY: dict[str, PPEFeatureDef] = {f.key: f for f in PPE_FEATURES}
