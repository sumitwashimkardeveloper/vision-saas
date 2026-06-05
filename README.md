# Offline Multi-Tenant Face Recognition

Local, fully offline, multi-tenant face recognition for on-prem hardware.
See [docs/plan.md](docs/plan.md), [docs/phases.md](docs/phases.md), and
[docs/decisions.md](docs/decisions.md).

Implemented:
- Phase 1 (Foundation): tenant-aware DB, gallery + embeddings cache, RTSP reader,
  single-camera recognition loop.
- Phase 2 (Multi-Tenant Core): tenant management CLI, a multi-tenant supervisor
  that runs every enabled camera across all tenants, and isolation tests.

## Layout
```
apps/core      shared library (config, db, models, repository, tenant_service,
               detector, recognizer, gallery, stream, pipeline)
apps/worker    camera_worker.py (per-camera loop), stream_worker.py (single camera),
               supervisor.py (all cameras across all tenants)
apps/api       (Phase 3 -- FastAPI, empty for now)
configs        app.yaml
migrations     Alembic (SQLite, WAL)
scripts        init_db.py, download_models.py, build_gallery.py, manage.py
tests          pytest: tenant isolation + management
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

# 3. Run recognition on one camera
.\venv\Scripts\python.exe -m apps.worker.stream_worker --tenant tenant_001 --camera "Front Door"
```

`people.json` (optional):
```json
{ "alice": { "name": "Alice Smith", "role": "staff", "details": "Floor 2" } }
```

## Multi-tenant (Phase 2)
Manage tenants, cameras, and people with the admin CLI:
```powershell
.\venv\Scripts\python.exe -m scripts.manage tenant create --id tenant_002 --name "Beta Corp"
.\venv\Scripts\python.exe -m scripts.manage tenant list
.\venv\Scripts\python.exe -m scripts.manage camera add --tenant tenant_002 --name "Lobby" --rtsp "rtsp://..."
.\venv\Scripts\python.exe -m scripts.manage person add --tenant tenant_002 --key carla --name "Carla" --role staff
.\venv\Scripts\python.exe -m scripts.manage person list --tenant tenant_002
.\venv\Scripts\python.exe -m scripts.manage events --tenant tenant_002 --limit 20
.\venv\Scripts\python.exe -m scripts.manage tenant delete --id tenant_002   # purges DB rows + files
```

Run recognition for **every enabled camera across all tenants** on one server:
```powershell
.\venv\Scripts\python.exe -m apps.worker.supervisor                  # all tenants
.\venv\Scripts\python.exe -m apps.worker.supervisor --tenant tenant_001
```
Ctrl+C stops all camera workers gracefully.

## Tests
```powershell
.\venv\Scripts\python.exe -m pytest
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
