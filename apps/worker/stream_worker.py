"""Single-tenant recognition loop (Phase 1).

Reads one camera's RTSP stream, detects faces on sampled frames, matches them
against the tenant gallery, and records match events. Phase 4 will run many of
these across processes; for now it is one tenant + one camera.

Usage:
    python -m apps.worker.stream_worker --tenant tenant_001 --camera "Front Door"
    python -m apps.worker.stream_worker --tenant tenant_001 --rtsp rtsp://... --camera-name test
"""

from __future__ import annotations

import argparse
import logging
import signal

from apps.core.config import AppConfig, load_config
from apps.core.db import session_scope
from apps.core.detector import FaceDetector
from apps.core.gallery import load_gallery
from apps.core.pipeline import record_match
from apps.core.recognizer import match
from apps.core.repository import TenantRepository
from apps.core.stream import RTSPStream

logger = logging.getLogger("stream_worker")


def run(
    config: AppConfig,
    tenant_id: str,
    rtsp_url: str,
    camera_id: int | None,
    camera_name: str,
) -> None:
    gallery = load_gallery(config, tenant_id)
    if gallery.is_empty():
        logger.warning(
            "[%s] gallery is empty — run scripts/build_gallery.py first. "
            "Faces will only ever log as 'unknown'.",
            tenant_id,
        )
    else:
        logger.info("[%s] loaded gallery with %d people", tenant_id, gallery.size)

    detector = FaceDetector(config.recognition)
    stream = RTSPStream(rtsp_url, config.stream, name=camera_name)

    # Graceful shutdown on Ctrl+C / SIGTERM.
    signal.signal(signal.SIGINT, lambda *_: stream.stop())
    try:
        signal.signal(signal.SIGTERM, lambda *_: stream.stop())
    except (ValueError, AttributeError):
        pass  # SIGTERM may be unavailable on some platforms/threads.

    rec = config.recognition
    logger.info("[%s] starting recognition on '%s'", tenant_id, camera_name)

    for frame in stream.frames():
        faces = detector.detect(frame)
        for face in faces:
            result = match(gallery, face.embedding, rec.match_threshold)
            if not result.is_match and not rec.log_unknowns:
                continue
            # One short-lived session per recorded event keeps the SQLite write
            # window tiny (relevant once many workers share the DB — ADR-002).
            with session_scope(config) as session:
                repo = TenantRepository(session, tenant_id)
                record_match(config, repo, result, frame, camera_id=camera_id)

    logger.info("[%s] worker stopped", tenant_id)


def main() -> None:
    parser = argparse.ArgumentParser(description="Single-tenant face recognition worker")
    parser.add_argument("--tenant", required=True, help="Tenant id (folder slug)")
    parser.add_argument("--camera", help="Existing camera name to look up in the DB")
    parser.add_argument("--rtsp", help="RTSP URL (overrides DB lookup; for ad-hoc runs)")
    parser.add_argument("--camera-name", default="adhoc", help="Label when using --rtsp")
    parser.add_argument("--config", help="Path to app.yaml")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    config = load_config(args.config)

    camera_id: int | None = None
    rtsp_url = args.rtsp
    camera_name = args.camera_name

    if rtsp_url is None:
        if not args.camera:
            parser.error("provide --camera (DB lookup) or --rtsp with --camera-name")
        with session_scope(config) as session:
            repo = TenantRepository(session, args.tenant)
            cameras = [c for c in repo.list_cameras() if c.name == args.camera]
            if not cameras:
                parser.error(f"camera '{args.camera}' not found for tenant '{args.tenant}'")
            camera = cameras[0]
            camera_id, rtsp_url, camera_name = camera.id, camera.rtsp_url, camera.name

    run(config, args.tenant, rtsp_url, camera_id, camera_name)


if __name__ == "__main__":
    main()
