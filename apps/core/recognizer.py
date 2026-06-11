"""Cosine-similarity matching of a probe embedding against a tenant gallery.

Multi-vector gallery: each enrolled image gets its own row. During matching
the probe is compared against every row; the best (max) score per person is
used to determine identity. This means a right-angle face in the camera
matches the right-angle enrollment image — not a blended mean that loses
angle-specific detail.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np


@dataclass
class Gallery:
    """In-memory gallery for one tenant.

    embeddings     : (M, 512) — one row per enrolled image (M >= N)
    person_indices : (M,)     — maps each row back to a person index in keys/names
    keys           : [P]      — unique external_key per person
    names          : [P]      — display name per person
    """
    keys: list[str]
    names: list[str]
    embeddings: np.ndarray          # shape (M, 512)
    person_indices: np.ndarray      # shape (M,) int32

    @property
    def size(self) -> int:
        return len(self.keys)

    def is_empty(self) -> bool:
        return self.size == 0


@dataclass
class MatchResult:
    is_match: bool
    key: str | None
    name: str
    score: float


def match(gallery: Gallery, probe: np.ndarray, threshold: float) -> MatchResult:
    """Match a probe embedding against the gallery using per-person max scoring.

    Steps:
      1. Normalise the probe.
      2. Dot-product with all M gallery rows → similarity vector (M,).
      3. For each person P, take max(sims[person_indices == P]).
      4. Best person wins; apply threshold.
    """
    if gallery.is_empty():
        return MatchResult(False, None, "unknown", 0.0)

    probe = probe.astype(np.float32)
    norm = np.linalg.norm(probe)
    if norm > 0:
        probe = probe / norm

    # (M,) similarities — one per enrolled image
    sims = gallery.embeddings @ probe

    n_people = len(gallery.keys)
    best_score = -1.0
    best_idx   = 0

    for i in range(n_people):
        mask = gallery.person_indices == i
        if not mask.any():
            continue
        score = float(np.max(sims[mask]))
        if score > best_score:
            best_score = score
            best_idx   = i

    if best_score >= threshold:
        return MatchResult(True, gallery.keys[best_idx], gallery.names[best_idx], best_score)
    return MatchResult(False, None, "unknown", best_score)
