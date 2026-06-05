"""Standalone single-camera recognition worker.

Runs one camera for one tenant. For running every camera across all tenants on
one server, use apps.worker.supervisor instead.

Usage:
    python -m apps.worker.stream_worker --tenant tenant_001 --camera "Front Door"
    python -m apps.worker.stream_worker --tenant tenant_001 --rtsp rtsp://... --camera-name test
"""

from __future__ import annotations

import argparse
import logging
import signal

from apps.core.config import load_config
from apps.core.db import session_scope
from apps.core.gallery import load_gallery
from apps.core.repository import TenantRepository
from apps.worker.camera_worker import CameraWorker

logger = logging.getLogger("stream_worker")


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
            camera = next((c for c in repo.list_cameras() if c.name == args.camera), None)
            if camera is None:
                parser.error(f"camera '{args.camera}' not found for tenant '{args.tenant}'")
            camera_id, rtsp_url, camera_name = camera.id, camera.rtsp_url, camera.name

    gallery = load_gallery(config, args.tenant)
    if gallery.is_empty():
        logger.warning(
            "[%s] gallery is empty — run scripts/build_gallery.py first. "
            "Faces will only ever log as 'unknown'.",
            args.tenant,
        )
    else:
        logger.info("[%s] loaded gallery with %d people", args.tenant, gallery.size)

    worker = CameraWorker(config, args.tenant, rtsp_url, camera_id, camera_name, gallery)

    signal.signal(signal.SIGINT, lambda *_: worker.stop())
    try:
        signal.signal(signal.SIGTERM, lambda *_: worker.stop())
    except (ValueError, AttributeError):
        pass

    worker.start()
    worker.join()


if __name__ == "__main__":
    main()
