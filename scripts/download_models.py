"""Download all models required by VisionFR.

Run once after cloning / setting up the environment:
    python scripts/download_models.py

Downloads:
  models/face_detection_yunet_2023mar.onnx   — YuNet face detector
  models/w600k_r50.onnx                       — ArcFace face recogniser
  models/yolov8s-worldv2.pt                   — YOLO-World object detector (loading/unloading)
  + pre-installs the CLIP text encoder used by YOLO-World
"""

from __future__ import annotations

import sys
import urllib.request
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
MODELS_DIR   = PROJECT_ROOT / "models"
MODELS_DIR.mkdir(exist_ok=True)

MODELS = [
    (
        "YuNet face detector",
        "https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx",
        MODELS_DIR / "face_detection_yunet_2023mar.onnx",
    ),
    (
        "ArcFace face recogniser",
        "https://github.com/opencv/opencv_zoo/raw/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx",
        MODELS_DIR / "w600k_r50.onnx",
    ),
    (
        "YOLO-World (loading/unloading detection)",
        "https://github.com/ultralytics/assets/releases/download/v8.4.0/yolov8s-worldv2.pt",
        MODELS_DIR / "yolov8s-worldv2.pt",
    ),
]


def _download(name: str, url: str, dest: Path) -> None:
    if dest.exists():
        print(f"  ✓ {name:42s} already at {dest.relative_to(PROJECT_ROOT)}")
        return

    print(f"  ↓ {name:42s} → {dest.relative_to(PROJECT_ROOT)}")
    tmp = dest.with_suffix(".tmp")
    try:
        def _progress(block, block_size, total):
            done = block * block_size
            if total > 0:
                pct = min(done / total * 100, 100)
                bar = "█" * int(pct / 5) + "░" * (20 - int(pct / 5))
                print(f"\r    [{bar}] {pct:5.1f}%  {done/1e6:6.1f}/{total/1e6:.1f} MB", end="", flush=True)

        urllib.request.urlretrieve(url, tmp, reporthook=_progress)
        print()
        tmp.rename(dest)
    except Exception as exc:
        tmp.unlink(missing_ok=True)
        raise RuntimeError(f"Failed to download {name}: {exc}") from exc


def _ensure_clip() -> None:
    """Pre-install the CLIP text encoder that YOLO-World requires."""
    try:
        import clip  # noqa: F401
        print("  ✓ CLIP text encoder                        already installed")
        return
    except ImportError:
        pass

    print("  ↓ CLIP text encoder                         installing via pip…")
    import subprocess
    result = subprocess.run(
        [sys.executable, "-m", "pip", "install", "--quiet",
         "git+https://github.com/ultralytics/CLIP.git"],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        print(f"    WARNING: CLIP install failed:\n{result.stderr}")
    else:
        print("    CLIP installed successfully.")


def main() -> None:
    print("\n=== VisionFR model setup ===\n")

    errors = []
    for name, url, dest in MODELS:
        try:
            _download(name, url, dest)
        except RuntimeError as e:
            print(f"    ERROR: {e}")
            errors.append(name)

    print()
    _ensure_clip()

    print()
    if errors:
        print(f"⚠  {len(errors)} model(s) failed to download: {', '.join(errors)}")
        print("   Re-run this script or place the files manually in models/")
        sys.exit(1)
    else:
        print("✓ All models ready. You can now start the server:\n")
        print("    uvicorn apps.api.main:app --reload\n")


if __name__ == "__main__":
    main()
