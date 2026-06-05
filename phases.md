# Phased Delivery Plan

## Phase 1 - Foundation (Local Offline MVP)
- Define local folder structure and configs
- Build RTSP stream reader with stable reconnect
- Implement face detection (existing)
- Create local gallery folder and loader
- Implement embeddings cache per tenant
- Implement basic recognition loop (single tenant)
- Save match events locally

Exit criteria:
- One tenant, one stream, local gallery
- Recognition works and logs events

## Phase 2 - Multi-Tenant Core
- Add tenant model and data separation
- Per-tenant gallery and embeddings
- Per-tenant events and snapshots
- Add local user auth (basic)

Exit criteria:
- Multiple tenants on same server
- Tenant users see only their data

## Phase 3 - Local API Service
- Build FastAPI endpoints
  - tenants, users, cameras
  - people enrollment
  - event querying
- Add local config management

Exit criteria:
- API handles all local operations
- Worker can run headless

## Phase 4 - Worker Service and Scaling
- Separate stream worker from API
- Multiprocessing per N cameras
- Frame sampling and backpressure
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
