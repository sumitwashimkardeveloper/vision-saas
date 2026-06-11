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

PPE_MODEL_FILE = "ppe_yolov8.onnx"


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


def fetch_ppe_train(api_key: str, force: bool = False) -> Path:
    """Download the Roboflow construction-safety dataset, train YOLOv8n, export ONNX.

    Requires: pip install roboflow ultralytics
    Uses the public 'construction-safety-gsnvb' dataset (1 206 images, CC BY 4.0).
    Training YOLOv8n for 30 epochs takes ~5–15 min on CPU, ~2 min on GPU.
    """
    dest = MODELS_DIR / PPE_MODEL_FILE
    if dest.exists() and not force:
        print(f"  PPE model already present: {dest}")
        print("  Run with --force to retrain.")
        return dest

    try:
        from roboflow import Roboflow  # noqa: PLC0415
    except ImportError:
        print("\n  ERROR: roboflow package not installed.")
        print("  Run:  pip install roboflow")
        sys.exit(1)

    try:
        from ultralytics import YOLO  # noqa: PLC0415
    except ImportError:
        print("\n  ERROR: ultralytics package not installed.")
        print("  Run:  pip install ultralytics")
        sys.exit(1)

    # ── 1. Download dataset ──────────────────────────────────────────────────
    print("  Connecting to Roboflow…")
    rf = Roboflow(api_key=api_key)
    project = rf.workspace("roboflow-100").project("construction-safety-gsnvb")
    version = project.version(1)
    print("  Downloading construction-safety-gsnvb dataset (1 206 images)…")
    dataset = version.download("yolov8")
    data_yaml = Path(dataset.location) / "data.yaml"
    print(f"  Dataset saved to {dataset.location}")

    # ── 2. Train YOLOv8n ─────────────────────────────────────────────────────
    print()
    print("  Training YOLOv8n for 30 epochs (grab a coffee ☕)…")
    model = YOLO("yolov8n.pt")   # downloads ~6 MB base weights automatically
    results = model.train(
        data=str(data_yaml),
        epochs=30,
        imgsz=640,
        batch=8,
        name="ppe_train",
        verbose=False,
    )

    # ── 3. Export to ONNX ────────────────────────────────────────────────────
    print("  Exporting best weights to ONNX…")
    best_pt = Path(results.save_dir) / "weights" / "best.pt"
    trained = YOLO(str(best_pt))
    export_path = Path(trained.export(format="onnx", imgsz=640))

    dest.parent.mkdir(parents=True, exist_ok=True)
    export_path.rename(dest)
    print(f"  Saved {dest} ({dest.stat().st_size / 1e6:.1f} MB)")

    # ── 4. Print app.yaml snippet ────────────────────────────────────────────
    class_names = [trained.names[i].lower() for i in sorted(trained.names)]
    _print_yaml_snippet(class_names)
    return dest


def _print_yaml_snippet(class_names: list[str]) -> None:
    print()
    print("  ── Copy this block into configs/app.yaml ───────────────────────────")
    print()
    print("  ppe:")
    print(f"    model: models/{PPE_MODEL_FILE}")
    print("    class_names:")
    for name in class_names:
        print(f"      - {name}")
    print()
    print("  ────────────────────────────────────────────────────────────────────")
    print()


def main() -> None:
    args = sys.argv[1:]
    force = "--force" in args
    MODELS_DIR.mkdir(parents=True, exist_ok=True)

    # --ppe-train YOUR_ROBOFLOW_API_KEY
    if "--ppe-train" in args:
        idx = args.index("--ppe-train")
        if idx + 1 >= len(args):
            print("Usage: python -m scripts.download_models --ppe-train YOUR_API_KEY")
            sys.exit(1)
        api_key = args[idx + 1]
        fetch_ppe_train(api_key, force=force)
        return

    print("Fetching recognition models into", MODELS_DIR)
    fetch_yunet(force)
    fetch_arcface(force)
    print("Done. Models are cached locally; runtime is fully offline.")


if __name__ == "__main__":
    main()
