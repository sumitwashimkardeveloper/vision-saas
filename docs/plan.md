# Offline Multi-Tenant Face Recognition - Product Plan

## Goal
Build a local, fully offline, multi-tenant face recognition system that runs on on-prem hardware, manages multiple tenants, and scales to up to 50 RTSP streams.

> Key architectural decisions (model, DB, auth) are recorded in [decisions.md](decisions.md).
> Summary: **ArcFace embeddings via ONNX Runtime + OpenCV YuNet detection** (no compiler needed), **tenant-aware SQLite (SQLAlchemy + Alembic, WAL)** from day one, **tenant isolation early / login in the API phase**.

## Total Product Flow
1) Tenant setup
- Admin creates tenants and a tenant admin account.
- Only the tenant admin can log in for that tenant.
- Each tenant owns its own cameras, people, and data.

2) Camera setup
- Add RTSP streams per tenant.
- Store camera metadata in local DB.

3) Enrollment (face gallery)
- Tenant admin adds people (name, role, details, images).
- Precompute face embeddings and cache them per tenant.

4) Stream processing
- Read RTSP frames on the edge server.
- Detect faces on sampled frames.
- Run recognition against tenant embeddings.
- Generate events for matches (and optional unknowns).

5) Events + storage
- Store match events in local DB.
- Store snapshots locally for review.

6) Review and reports
- Tenant admin views dashboards, alerts, and history.
- Export reports locally if needed.

## Offline Service Layout (Local Only)
- Web UI
  - Admin-only dashboard, camera management, people management
- API Server (FastAPI)
  - Admin auth, tenant isolation, gallery operations, event querying
- Stream Worker Service
  - RTSP ingestion, detection, recognition, event creation
- Local DB
  - SQLite (MVP) → Postgres (scale). Same SQLAlchemy models + Alembic migrations for both.
- Local Storage
  - Images, snapshots, cached embeddings

## Folder Structure (Local Files)
```
/vision-system
  /apps
    /api                  # FastAPI service (Phase 3)
    /core                 # shared library: config, db, models, recognition, stream, pipeline
    /worker
      stream_worker.py    # single-tenant recognition loop (Phase 1) -> multiprocess (Phase 4)
  /data                   # runtime data (gitignored)
    /tenants
      /tenant_001
        /people
          /alice
            01.jpg
            02.jpg
          /bob
            01.jpg
        /embeddings
          gallery.npz
        people.json
      /tenant_002
        /people
          /carla
            01.jpg
    /events
      tenant_001/
      tenant_002/
    /snapshots
      tenant_001/
      tenant_002/
    vision.db             # SQLite (WAL mode)
  /configs
    app.yaml
  /migrations             # Alembic
  /scripts
    init_db.py
    build_gallery.py
  /ui
    (static build or separate front-end)
  README.md
```

## Core Modules
- People Registry: stores name, role, details, and images (tenant-scoped)
- Gallery Manager: loads images, builds embeddings, caches gallery per tenant
- Stream Manager: connects to RTSP, frame sampling, stable reconnect
- Detector: face detection + 5-point landmarks (OpenCV YuNet)
- Recognizer: ArcFace embedding (ONNX Runtime) + cosine match + threshold
- Event Pipeline: persist event + snapshot
- Tenant Guard: ensures tenant isolation for all data access and API calls

## Operational Targets
- 1-3 FPS per stream for recognition (configurable)
- Up to 50 streams with process pool and sampling
- Offline mode only, no external dependencies at runtime
  - One-time exception: the ONNX model files (YuNet + ArcFace) are downloaded once during setup, then cached locally in `models/` and used fully offline.

## Tech Choices (Python)
- FastAPI for local API
- OpenCV for RTSP ingest **and** face detection (`cv2.FaceDetectorYN` / YuNet)
- **ArcFace `w600k_r50`** embeddings run via **ONNX Runtime** (no compiler needed; the `insightface` package is intentionally avoided on Windows — see [decisions.md](decisions.md) ADR-001)
- SQLAlchemy ORM + Alembic migrations
- SQLite for MVP, Postgres for scale (same models/migrations)

## Security
- Local auth only (tenant admin login), added in the API phase
- **Tenant isolation is enforced in the data layer from Phase 1** (every table, path, and embeddings cache is keyed by `tenant_id`; all access goes through a tenant-scoped repository / Tenant Guard)
- Store passwords hashed (bcrypt/argon2)
- Keep RTSP credentials in local config (not in the repo)

## Hardware
- Production: one mid-range NVIDIA GPU (~8-12 GB VRAM) for ~50 sampled streams at 1-3 FPS.
- Dev: CPU-only ONNX Runtime path is supported (lower throughput).

## MVP Scope
- One server machine
- Multi-tenant with admin-only login
- Stream view and recognition alerts
- Local gallery upload (name, role, details, images)
- Local event history
