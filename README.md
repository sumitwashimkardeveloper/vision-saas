# Offline Multi-Tenant Face Recognition

Local, fully offline, multi-tenant face recognition for on-prem hardware.
See [docs/plan.md](docs/plan.md), [docs/phases.md](docs/phases.md), and
[docs/decisions.md](docs/decisions.md).

Phase 1 (Foundation) is implemented: tenant-aware DB, gallery + embeddings
cache, RTSP reader, and a single-tenant recognition loop.

## Layout
```
apps/core      shared library (config, db, models, detector, recognizer, gallery, stream, pipeline)
apps/worker    stream_worker.py  -- single-tenant recognition loop
apps/api       (Phase 3 -- FastAPI, empty for now)
configs        app.yaml
migrations     Alembic (SQLite, WAL)
scripts        init_db.py, build_gallery.py
data           runtime data (gitignored): tenants/, snapshots/, vision.db
```

## Setup
```powershell
.\venv\Scripts\python.exe -m pip install -r requirements.txt
# Fetch the ONNX models once (YuNet detector + ArcFace embeddings) into models/
.\venv\Scripts\python.exe -m scripts.download_models
```
> No C++ compiler needed: detection uses OpenCV's bundled YuNet and recognition
> runs the ArcFace ONNX model through onnxruntime. See "Face model" below.

## Quickstart
```powershell
# 1. Create the DB + a tenant (and optionally a camera)
.\venv\Scripts\python.exe -m scripts.init_db --tenant tenant_001 --name "Acme HQ" `
    --camera "Front Door" --rtsp "rtsp://user:pass@host/stream"

# 2. Enroll people: drop images under
#    data/tenants/tenant_001/people/<key>/*.jpg
#    (optional metadata in data/tenants/tenant_001/people.json)
.\venv\Scripts\python.exe -m scripts.build_gallery --tenant tenant_001

# 3. Run recognition on the camera
.\venv\Scripts\python.exe -m apps.worker.stream_worker --tenant tenant_001 --camera "Front Door"
```

`people.json` (optional):
```json
{ "alice": { "name": "Alice Smith", "role": "staff", "details": "Floor 2" } }
```

## Configuration
Edit [configs/app.yaml](configs/app.yaml): model file paths, ONNX providers
(`CUDAExecutionProvider` first on GPU hosts), detector size + score threshold,
cosine match threshold, target FPS, and reconnect behaviour.

## Face model
- **Detection:** OpenCV YuNet (`cv2.FaceDetectorYN`) — bundled with opencv-python,
  returns boxes + 5 landmarks used to align faces to 112×112.
- **Recognition:** ArcFace `w600k_r50` (512-d embeddings) run via **onnxruntime**.
- No C++ compiler required. `scripts/download_models.py` fetches both model files
  once into `models/`; after that the system runs fully offline.
- On a Linux GPU server you may instead `pip install insightface` for its
  all-in-one pipeline — the `gallery.npz` format is the same either way
  (see [docs/decisions.md](docs/decisions.md) ADR-001).
