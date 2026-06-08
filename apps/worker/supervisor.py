"""Multi-tenant supervisor (Phase 2).

Runs recognition for every enabled camera across all tenants (or a chosen
tenant) on one server, one CameraWorker thread per camera. Each tenant's gallery
is loaded once and shared read-only across that tenant's cameras.

Usage:
    python -m apps.worker.supervisor                 # all tenants, all enabled cameras
    python -m apps.worker.supervisor --tenant t_001  # one tenant only

Scope note: this is the thread-based "many tenants on one box" milestone.
Phase 4 replaces threads with a process pool plus frame sampling/backpressure,
health checks, and watchdogs for the 50-stream target.
"""

from __future__ import annotations

import argparse
import logging
import signal
import threading

from apps.core.config import AppConfig, load_config
from apps.core.db import session_scope
from apps.core.gallery import load_gallery
from apps.core.repository import TenantRepository
from apps.core.tenant_service import list_tenants
from apps.worker.camera_worker import CameraWorker
from apps.worker.event_batcher import EventBatcher   # Fix 7

logger = logging.getLogger("supervisor")


def _collect_targets(config: AppConfig, only_tenant: str | None):
    """Return [(tenant_id, gallery, [(camera_id, name, rtsp)])] for enabled cameras."""
    targets = []
    with session_scope(config) as session:
        tenant_ids = (
            [only_tenant] if only_tenant else [t.id for t in list_tenants(session)]
        )
        for tid in tenant_ids:
            repo = TenantRepository(session, tid)
            if repo.get_tenant() is None:
                logger.warning("tenant '%s' not found — skipping", tid)
                continue
            cams = [(c.id, c.name, c.rtsp_url) for c in repo.list_cameras(enabled_only=True)]
            if not cams:
                logger.info("[%s] no enabled cameras", tid)
                continue
            gallery = load_gallery(config, tid)
            if gallery.is_empty():
                logger.warning("[%s] gallery empty — matches will all be 'unknown'", tid)
            targets.append((tid, gallery, cams))
    return targets


def run(config: AppConfig, only_tenant: str | None = None) -> None:
    targets = _collect_targets(config, only_tenant)

    if not targets:
        logger.warning("no enabled cameras to run — nothing to do")
        return

    # Fix 7: one shared EventBatcher funnels all DB writes through a single
    # writer thread, eliminating per-event SQLite lock contention across
    # multiple CameraWorker threads (ADR-002).
    batcher = EventBatcher(config)

    workers: list[CameraWorker] = []
    for tenant_id, gallery, cams in targets:
        for camera_id, name, rtsp in cams:
            workers.append(
                CameraWorker(
                    config, tenant_id, rtsp, camera_id, name, gallery,
                    event_sink=batcher.add,   # Fix 7: non-blocking hand-off
                )
            )

    stop_event = threading.Event()
    signal.signal(signal.SIGINT, lambda *_: stop_event.set())
    try:
        signal.signal(signal.SIGTERM, lambda *_: stop_event.set())
    except (ValueError, AttributeError):
        pass

    logger.info(
        "starting %d camera worker(s) across %d tenant(s)",
        len(workers),
        len({w.tenant_id for w in workers}),
    )
    for w in workers:
        w.start()

    # Wait for shutdown signal; then stop all streams and join.
    stop_event.wait()
    logger.info("shutdown requested — stopping workers")
    for w in workers:
        w.stop()
    for w in workers:
        w.join(timeout=10)
    batcher.stop()   # flush remaining events before exiting
    logger.info("supervisor stopped")


def main() -> None:
    parser = argparse.ArgumentParser(description="Multi-tenant recognition supervisor")
    parser.add_argument("--tenant", help="Run only this tenant (default: all tenants)")
    parser.add_argument("--config", help="Path to app.yaml")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    run(load_config(args.config), only_tenant=args.tenant)


if __name__ == "__main__":
    main()
