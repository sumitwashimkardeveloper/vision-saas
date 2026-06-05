# Offline Multi-Tenant Face Recognition - Product Plan

## Goal
Build a local, fully offline, multi-tenant face recognition system that runs on on-prem hardware, manages multiple tenants, and scales to up to 50 RTSP streams.

## Total Product Flow
1) Tenant setup
- Admin creates tenants and local users.
- Each tenant owns its own cameras, people, and data.

2) Camera setup
- Add RTSP streams per tenant.
- Store camera metadata in local DB.

3) Enrollment (face gallery)
- Upload images into the local tenant gallery.
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
- Tenant users view dashboards, alerts, and history.
- Export reports locally if needed.

## Offline Service Layout (Local Only)
- Web UI
  - Tenant dashboard, camera management, people management
- API Server (FastAPI)
  - Auth, tenant isolation, gallery operations, event querying
- Stream Worker Service
  - RTSP ingestion, detection, recognition, event creation
- Local DB
  - SQLite (MVP) or Postgres (scale)
- Local Storage
  - Images, snapshots, cached embeddings

## Folder Structure (Local Files)
```
/vision-system
  /apps
    /api
      main.py
      routers/
      schemas/
      services/
    /worker
      stream_worker.py
      recognition.py
      detectors.py
  /data
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
  /configs
    app.yaml
  /scripts
    build_gallery.py
    migrate_db.py
  /ui
    (static build or separate front-end)
  README.md
```

## Core Modules
- Gallery Manager: loads images, builds embeddings, caches gallery
- Stream Manager: connects to RTSP, frame sampling
- Detector: face detection
- Recognizer: embedding + match + threshold
- Event Pipeline: persist event + snapshot
- Tenant Guard: ensures tenant isolation for data and API calls

## Operational Targets
- 1-3 FPS per stream for recognition (configurable)
- Up to 50 streams with process pool and sampling
- Offline mode only, no external dependencies at runtime

## Tech Choices (Python)
- FastAPI for local API
- OpenCV for RTSP ingest
- InsightFace or face_recognition for embeddings
- SQLite for MVP, Postgres for scale

## Security
- Local auth only (tenant-scoped)
- Store passwords hashed
- Keep RTSP credentials in local config

## MVP Scope
- One server machine
- Multi-tenant login
- Stream view and recognition alerts
- Local gallery upload
- Local event history
