# Architecture Decisions

Short records of the decisions that shape the build. Newest first.

## ADR-001: Face model = ArcFace embeddings, run via ONNX Runtime
**Status:** Accepted (2026-06-05), amended same day (implementation)

**Decision:** Use the **ArcFace `w600k_r50`** embedding model (the same recognition
model shipped in InsightFace's `buffalo_l` pack) for face recognition, executed
**directly through ONNX Runtime** rather than via the `insightface` Python package.
Face detection + 5-point landmarks use **OpenCV's bundled YuNet** detector
(`cv2.FaceDetectorYN`); faces are aligned to 112×112 and embedded by ArcFace.

**Why ArcFace:**
- State-of-the-art accuracy; GPU acceleration via ONNX Runtime (CUDA/TensorRT) is needed to hit ~50 streams.
- `face_recognition` (dlib) is CPU-bound, weaker, and would not reach the throughput target.
- The embedding model choice is effectively irreversible — changing it invalidates every enrolled gallery (re-enroll everyone). Decide once.

**Why ONNX Runtime instead of the `insightface` package:**
- The `insightface` PyPI package builds a Cython extension (3D face mesh, which we
  don't use) and on Windows requires the MSVC C++ Build Tools — a multi-GB,
  admin-only install that blocked setup on the dev machine.
- The *models* are plain ONNX files; running them through onnxruntime (already a
  dependency) needs no compiler and gives the **same embeddings / accuracy**.
- YuNet detection ships inside `opencv-python`, so detection also needs no extra
  build step. This keeps the dev box compiler-free.

**Consequences:**
- 512-d ArcFace embeddings, matched by cosine similarity (unchanged).
- Two model files are fetched once at setup (`scripts/download_models.py`) into
  `models/`, then used fully offline: YuNet (~0.2 MB) + `w600k_r50.onnx` (~166 MB).
- Production needs one mid-range NVIDIA GPU (~8-12 GB VRAM); CPU path supported for dev.
- The `insightface` package remains an *optional* alternative on Linux GPU hosts;
  the on-disk gallery format (`gallery.npz`) is compatible either way.

## ADR-002: DB = SQLite now, tenant-aware schema + Alembic from day one
**Status:** Accepted (2026-06-05)

**Decision:** SQLAlchemy ORM + Alembic migrations on SQLite (WAL mode) for the MVP. Single shared schema with a `tenant_id` column on every tenant-scoped table (not a DB-per-tenant). Postgres later uses the same models/migrations.

**Why:**
- Shared-schema + `tenant_id` is the standard multi-tenant pattern and ports cleanly to Postgres.
- Alembic from the first table makes the SQLite -> Postgres move nearly free and enforces schema discipline.
- WAL mode + batched event writes mitigate SQLite's single-writer limit under many concurrent stream workers.

**Consequences:**
- Every query goes through a tenant-scoped repository; no raw unscoped access.
- If write contention bites at scale, flip the connection string to Postgres — migrations already exist.

## ADR-003: Tenant isolation early, login later
**Status:** Accepted (2026-06-05)

**Decision:** Enforce tenant isolation in the data layer starting Phase 1 (every table/path/embeddings cache keyed by `tenant_id`, all access via a Tenant Guard). Defer actual user login (hashed passwords, session/JWT) to Phase 3 when the API exists.

**Why:**
- The risky, expensive-to-retrofit part is isolation, not the login screen. Cross-tenant data leakage is the worst failure mode for this system.
- Building isolation in costs almost nothing early; bolting it on later means rewriting every data-access path.
- Login naturally belongs at the API boundary, which arrives in Phase 3.

**Consequences:**
- Phase 1 code carries a tenant context even while only one tenant runs.
- Phase 3 attaches an authenticated identity to the already-existing tenant scope.
