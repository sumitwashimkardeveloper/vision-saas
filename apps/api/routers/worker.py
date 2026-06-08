"""Worker lifecycle: start/stop the recognition supervisor for the authenticated tenant.

The supervisor is spawned as a child process of the API server so there is no
need to run a separate terminal command. One process per tenant is tracked in
module-level state (safe because a local deployment runs a single uvicorn worker).
"""

from __future__ import annotations

import subprocess
import sys
import threading

from fastapi import APIRouter, Depends

from apps.api.deps import get_current_user
from apps.api.schemas import MessageResult
from apps.core.config import PROJECT_ROOT
from apps.core.models import User

router = APIRouter(prefix="/worker", tags=["worker"])

_processes: dict[str, subprocess.Popen] = {}
_lock = threading.Lock()


def _alive(proc: subprocess.Popen) -> bool:
    return proc.poll() is None


@router.get("/status")
def worker_status(user: User = Depends(get_current_user)):
    with _lock:
        proc = _processes.get(user.tenant_id)
        running = proc is not None and _alive(proc)
    return {"running": running}


@router.post("/start", response_model=MessageResult)
def start_worker(user: User = Depends(get_current_user)) -> MessageResult:
    with _lock:
        proc = _processes.get(user.tenant_id)
        if proc is not None and _alive(proc):
            return MessageResult(message="Already running")
        new_proc = subprocess.Popen(
            [sys.executable, "-m", "apps.worker.supervisor", "--tenant", user.tenant_id],
            cwd=str(PROJECT_ROOT),
        )
        _processes[user.tenant_id] = new_proc
    return MessageResult(message="Recognition started")


@router.post("/stop", response_model=MessageResult)
def stop_worker(user: User = Depends(get_current_user)) -> MessageResult:
    with _lock:
        proc = _processes.pop(user.tenant_id, None)
        if proc is None or not _alive(proc):
            return MessageResult(message="Not running")
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait()
    return MessageResult(message="Recognition stopped")
