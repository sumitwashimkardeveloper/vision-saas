"""Cosine-similarity matching of a probe embedding against a tenant gallery.

The gallery holds one mean embedding per enrolled person. Because all
embeddings are L2-normalized, cosine similarity is just a dot product, so a
whole gallery match is a single matrix-vector multiply.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass
class Gallery:
    """In-memory gallery for one tenant."""
    keys: list[str]            # person external_key per row
    names: list[str]           # display name per row
    embeddings: np.ndarray     # shape (N, 512), L2-normalized

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
    """Match a single probe embedding against the gallery."""
    if gallery.is_empty():
        return MatchResult(False, None, "unknown", 0.0)

    probe = probe.astype(np.float32)
    norm = np.linalg.norm(probe)
    if norm > 0:
        probe = probe / norm

    sims = gallery.embeddings @ probe          # (N,)
    best = int(np.argmax(sims))
    score = float(sims[best])

    if score >= threshold:
        return MatchResult(True, gallery.keys[best], gallery.names[best], score)
    return MatchResult(False, None, "unknown", score)
