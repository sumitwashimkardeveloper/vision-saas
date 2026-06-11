"""Re-export all schemas for backwards-compatible imports."""
from .auth import (
    LoginRequest, RegisterRequest, TokenResponse,
    ChangePasswordRequest, UserOut, TenantOut, TenantSummaryOut,
)
from .cameras import CameraCreate, CameraOut, CameraUpdate
from .people import PersonCreate, PersonOut, GalleryRebuildResult
from .events import EventOut
from .features import FeatureOut
from .common import MessageResult

__all__ = [
    "LoginRequest", "RegisterRequest", "TokenResponse",
    "ChangePasswordRequest", "UserOut", "TenantOut", "TenantSummaryOut",
    "CameraCreate", "CameraOut", "CameraUpdate",
    "PersonCreate", "PersonOut", "GalleryRebuildResult",
    "EventOut",
    "FeatureOut",
    "MessageResult",
]
