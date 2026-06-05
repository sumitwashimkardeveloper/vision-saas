"""Download the ONNX model files needed for recognition (run once, then offline).

Fetches:
  - YuNet face detector   -> models/face_detection_yunet_2023mar.onnx  (~0.2 MB)
  - ArcFace w600k_r50      -> models/w600k_r50.onnx                     (~166 MB)

ArcFace is distributed inside InsightFace's buffalo_l.zip; we download the zip,
extract just w600k_r50.onnx, and discard the rest.

Usage:
    python -m scripts.download_models
"""

from __future__ import annotations

import io
import sys
import urllib.request
import zipfile
from pathlib import Path

from apps.core.config import PROJECT_ROOT

MODELS_DIR = PROJECT_ROOT / "models"

YUNET_URL = (
    "https://github.com/opencv/opencv_zoo/raw/main/models/"
    "face_detection_yunet/face_detection_yunet_2023mar.onnx"
)
YUNET_FILE = "face_detection_yunet_2023mar.onnx"

BUFFALO_L_URL = "https://github.com/deepinsight/insightface/releases/download/v0.7/buffalo_l.zip"
ARCFACE_MEMBER = "w600k_r50.onnx"
ARCFACE_FILE = "w600k_r50.onnx"


def _download(url: str) -> bytes:
    print(f"  downloading {url}")
    with urllib.request.urlopen(url) as resp:  # noqa: S310 (trusted release URLs)
        return resp.read()


def fetch_yunet(force: bool = False) -> Path:
    dest = MODELS_DIR / YUNET_FILE
    if dest.exists() and not force:
        print(f"  YuNet already present: {dest}")
        return dest
    dest.write_bytes(_download(YUNET_URL))
    print(f"  saved {dest} ({dest.stat().st_size/1e6:.1f} MB)")
    return dest


def fetch_arcface(force: bool = False) -> Path:
    dest = MODELS_DIR / ARCFACE_FILE
    if dest.exists() and not force:
        print(f"  ArcFace already present: {dest}")
        return dest
    data = _download(BUFFALO_L_URL)
    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        member = next((n for n in zf.namelist() if n.endswith(ARCFACE_MEMBER)), None)
        if member is None:
            raise RuntimeError(f"{ARCFACE_MEMBER} not found inside buffalo_l.zip")
        dest.write_bytes(zf.read(member))
    print(f"  saved {dest} ({dest.stat().st_size/1e6:.1f} MB)")
    return dest


def main() -> None:
    force = "--force" in sys.argv
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    print("Fetching recognition models into", MODELS_DIR)
    fetch_yunet(force)
    fetch_arcface(force)
    print("Done. Models are cached locally; runtime is fully offline.")


if __name__ == "__main__":
    main()
