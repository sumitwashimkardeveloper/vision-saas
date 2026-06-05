# Phased Delivery Plan

> Architectural decisions that shape these phases are in [decisions.md](decisions.md).

## Phase 0 - Decisions (done)
- Model: ArcFace `w600k_r50` embeddings via ONNX Runtime + OpenCV YuNet detection (no compiler; `insightface` package avoided on Windows — ADR-001).
- DB: SQLite + SQLAlchemy + Alembic, WAL mode; tenant-aware schema from day one.
- Auth: tenant isolation enforced in the data layer from Phase 1; login added in Phase 3.

## Phase 1 - Foundation (Local Offline MVP)
- Define local folder structure and configs (`configs/app.yaml`)
- Tenant-aware DB layer: SQLAlchemy models with `tenant_id` on every table, session factory with WAL, Alembic initial migration, tenant-scoped repository (Tenant Guard)
- Fetch ONNX models once (`scripts/download_models.py`: YuNet + ArcFace)
- Build RTSP stream reader with stable reconnect
- Implement face detection (YuNet) + ArcFace embeddings via ONNX Runtime
- Create local gallery folder and loader
- Implement embeddings cache per tenant (`gallery.npz`)
- Implement basic recognition loop (single tenant)
- Save match events locally (DB + snapshot)

Exit criteria:
- One tenant, one stream, local gallery
- Recognition works and logs events
- All data access is tenant-scoped (no raw, unscoped queries)

## Phase 2 - Multi-Tenant Core
- Run multiple tenants on the same server (schema already tenant-aware)
- Per-tenant gallery and embeddings
- Per-tenant events and snapshots
- Tenant CRUD + management

Exit criteria:
- Multiple tenants on same server
- Tenant data is provably isolated (no cross-tenant reads)

## Phase 3 - Local API Service + Auth
- Build FastAPI endpoints
  - tenants, users, cameras
  - people enrollment
  - event querying
- Add local user auth (hashed passwords, session/JWT); attach authenticated identity to the existing tenant scope
- Add local config management

Exit criteria:
- API handles all local operations
- Login enforces tenant admin access
- Worker can run headless

## Phase 4 - Worker Service and Scaling
- Separate stream worker from API
- Multiprocessing per N cameras
- Frame sampling and backpressure
- Batch event writes (avoid SQLite single-writer contention); flip to Postgres if needed (same migrations)
- Health checks and watchdogs

Exit criteria:
- Handles up to 50 streams with sampling
- Stable long-run execution

## Phase 5 - UI and Reporting
- Local dashboard UI
- Event timeline and search
- Simple reports (CSV export)

Exit criteria:
- Usable local admin UI

## Phase 6 - Hardening
- Improved error handling
- Local backups (DB + snapshots)
- Installer or single-binary packaging
- Simple upgrade strategy

Exit criteria:
- Local deployment is repeatable and reliable
