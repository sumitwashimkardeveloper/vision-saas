"""ProcessManager: multiprocess scaling + watchdog (Phase 4).

Partitions all enabled cameras (across tenants, or one tenant) into groups of
``cameras_per_process`` and runs each group in its own OS process. A watchdog
restarts any process that dies or stops heartbeating. This is the path to the
50-stream target; the thread-only supervisor (Phase 2) remains for small setups.

Usage:
    python -m apps.worker.manager                  # all tenants
    python -m apps.worker.manager --tenant t_001
"""

from __future__ import annotations

import argparse
import logging
import multiprocessing as mp
import signal
import time

from apps.core.config import AppConfig, load_config
from apps.core.db import session_scope
from apps.core.repository import TenantRepository
from apps.core.tenant_service import list_tenants
from apps.worker.worker_process import CameraAssignment, run_worker_process

logger = logging.getLogger("manager")


def collect_assignments(config: AppConfig, only_tenant: str | None) -> list[CameraAssignment]:
    assignments: list[CameraAssignment] = []
    with session_scope(config) as session:
        tenant_ids = [only_tenant] if only_tenant else [t.id for t in list_tenants(session)]
        for tid in tenant_ids:
            repo = TenantRepository(session, tid)
            if repo.get_tenant() is None:
                logger.warning("tenant '%s' not found — skipping", tid)
                continue
            for cam in repo.list_cameras(enabled_only=True):
                assignments.append(CameraAssignment(tid, cam.id, cam.name, cam.rtsp_url))
    return assignments


def _partition(items: list, size: int) -> list[list]:
    size = max(1, size)
    return [items[i : i + size] for i in range(0, len(items), size)]


class ProcessManager:
    def __init__(self, config: AppConfig, config_path: str | None = None, only_tenant: str | None = None):
        self.config = config
        self.config_path = config_path
        self.only_tenant = only_tenant
        self._ctx = mp.get_context("spawn")
        self._mgr = self._ctx.Manager()
        self._heartbeat = self._mgr.dict()
        self._stop_event = self._ctx.Event()
        # index -> (process, assignments)
        self._procs: dict[int, tuple[mp.process.BaseProcess, list[CameraAssignment]]] = {}

    def _spawn(self, index: int, assignments: list[CameraAssignment]) -> None:
        proc = self._ctx.Process(
            target=run_worker_process,
            args=(self.config_path, index, assignments, self._heartbeat, self._stop_event),
            name=f"vision-worker-{index}",
        )
        proc.start()
        self._heartbeat[index] = time.time()
        self._procs[index] = (proc, assignments)
        logger.info("spawned worker %d (pid=%s) for %d camera(s)", index, proc.pid, len(assignments))

    def run(self) -> None:
        assignments = collect_assignments(self.config, self.only_tenant)
        if not assignments:
            logger.warning("no enabled cameras to run — nothing to do")
            return

        partitions = _partition(assignments, self.config.worker.cameras_per_process)
        logger.info(
            "running %d camera(s) in %d process(es) (%d per process)",
            len(assignments),
            len(partitions),
            self.config.worker.cameras_per_process,
        )

        signal.signal(signal.SIGINT, lambda *_: self._stop_event.set())
        try:
            signal.signal(signal.SIGTERM, lambda *_: self._stop_event.set())
        except (ValueError, AttributeError):
            pass

        for index, part in enumerate(partitions):
            self._spawn(index, part)

        self._watchdog_loop()
        self._shutdown()

    def _watchdog_loop(self) -> None:
        wcfg = self.config.worker
        while not self._stop_event.is_set():
            self._stop_event.wait(wcfg.watchdog_poll_sec)
            if self._stop_event.is_set():
                break
            now = time.time()
            for index, (proc, part) in list(self._procs.items()):
                stale = (now - self._heartbeat.get(index, 0)) > wcfg.heartbeat_timeout_sec
                if not proc.is_alive():
                    logger.warning("worker %d died (exit=%s) — restarting", index, proc.exitcode)
                elif stale:
                    logger.warning("worker %d heartbeat stale — restarting", index)
                    proc.terminate()
                    proc.join(timeout=5)
                else:
                    continue
                time.sleep(wcfg.restart_backoff_sec)
                if not self._stop_event.is_set():
                    self._spawn(index, part)

    def _shutdown(self) -> None:
        logger.info("shutdown requested — stopping %d worker(s)", len(self._procs))
        self._stop_event.set()
        for proc, _ in self._procs.values():
            proc.join(timeout=15)
            if proc.is_alive():
                logger.warning("force-terminating worker pid=%s", proc.pid)
                proc.terminate()
        logger.info("manager stopped")


def main() -> None:
    parser = argparse.ArgumentParser(description="Multiprocess recognition manager (Phase 4)")
    parser.add_argument("--tenant", help="Run only this tenant (default: all tenants)")
    parser.add_argument("--config", help="Path to app.yaml")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    config = load_config(args.config)
    ProcessManager(config, config_path=args.config, only_tenant=args.tenant).run()


if __name__ == "__main__":
    main()
