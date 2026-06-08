"""Re-export all schemas for backwards-compatible imports."""
from .auth import (
    LoginRequest, RegisterRequest, TokenResponse,
    ChangePasswordRequest, UserOut, TenantOut, TenantSummaryOut,
)
from .cameras import CameraCreate, CameraOut
from .people import PersonCreate, PersonOut, GalleryRebuildResult
from .events import EventOut
from .common import MessageResult

__all__ = [
    "LoginRequest", "RegisterRequest", "TokenResponse",
    "ChangePasswordRequest", "UserOut", "TenantOut", "TenantSummaryOut",
    "CameraCreate", "CameraOut",
    "PersonCreate", "PersonOut", "GalleryRebuildResult",
    "EventOut",
    "MessageResult",
]
