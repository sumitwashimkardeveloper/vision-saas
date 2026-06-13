"""Re-export all schemas for backwards-compatible imports."""
from .auth import (
    LoginRequest, RegisterRequest, TokenResponse,
    ChangePasswordRequest, UserOut, TenantOut, TenantSummaryOut,
)
from .cameras import CameraCreate, CameraOut, CameraUpdate
from .people import PersonCreate, PersonOut, GalleryRebuildResult
from .events import EventOut
from .common import MessageResult
from .features import FeatureCamerasIn, FeatureOut
from .loading import LoadingConfigIn, LoadingConfigOut, LoadingCountsOut

__all__ = [
    "LoginRequest", "RegisterRequest", "TokenResponse",
    "ChangePasswordRequest", "UserOut", "TenantOut", "TenantSummaryOut",
    "CameraCreate", "CameraOut", "CameraUpdate",
    "PersonCreate", "PersonOut", "GalleryRebuildResult",
    "EventOut",
    "MessageResult",
    "FeatureOut", "FeatureCamerasIn",
    "LoadingConfigIn", "LoadingConfigOut", "LoadingCountsOut",
]
