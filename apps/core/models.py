"""SQLAlchemy models. Every tenant-scoped table carries a ``tenant_id`` so the
schema is multi-tenant from day one (see docs/decisions.md ADR-002/003)."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class Tenant(Base):
    __tablename__ = "tenants"

    # Human-readable slug used both as PK and as the on-disk folder name.
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    cameras: Mapped[list["Camera"]] = relationship(back_populates="tenant", cascade="all, delete-orphan")
    people: Mapped[list["Person"]] = relationship(back_populates="tenant", cascade="all, delete-orphan")
    events: Mapped[list["Event"]] = relationship(back_populates="tenant", cascade="all, delete-orphan")
    users: Mapped[list["User"]] = relationship(back_populates="tenant", cascade="all, delete-orphan")
    features: Mapped[list["TenantFeature"]] = relationship(back_populates="tenant", cascade="all, delete-orphan")
    loading_config: Mapped[list["LoadingUnloadingConfig"]] = relationship(back_populates="tenant", cascade="all, delete-orphan")


class User(Base):
    """A tenant admin account. Login is scoped to a tenant (ADR-003): the
    authenticated user's tenant_id drives all data access in the API."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True)
    username: Mapped[str] = mapped_column(String(128))
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(32), default="admin")
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    tenant: Mapped[Tenant] = relationship(back_populates="users")

    __table_args__ = (UniqueConstraint("tenant_id", "username", name="uq_user_tenant_username"),)


class Camera(Base):
    __tablename__ = "cameras"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(255))
    rtsp_url: Mapped[str] = mapped_column(Text)
    enabled: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    tenant: Mapped[Tenant] = relationship(back_populates="cameras")

    __table_args__ = (UniqueConstraint("tenant_id", "name", name="uq_camera_tenant_name"),)


class Person(Base):
    __tablename__ = "people"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True)
    # Stable slug matching the person's folder under data/tenants/<t>/people/<key>.
    external_key: Mapped[str] = mapped_column(String(128))
    name: Mapped[str] = mapped_column(String(255))
    role: Mapped[str | None] = mapped_column(String(255), nullable=True)
    details: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    tenant: Mapped[Tenant] = relationship(back_populates="people")
    events: Mapped[list["Event"]] = relationship(back_populates="person")

    __table_args__ = (UniqueConstraint("tenant_id", "external_key", name="uq_person_tenant_key"),)


class Event(Base):
    __tablename__ = "events"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True)
    camera_id: Mapped[int | None] = mapped_column(ForeignKey("cameras.id", ondelete="SET NULL"), nullable=True)
    person_id: Mapped[int | None] = mapped_column(ForeignKey("people.id", ondelete="SET NULL"), nullable=True)
    # Denormalized label so events stay readable even if a person is later deleted.
    label: Mapped[str] = mapped_column(String(255))
    score: Mapped[float] = mapped_column(Float)
    snapshot_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, index=True)

    tenant: Mapped[Tenant] = relationship(back_populates="events")
    person: Mapped[Person | None] = relationship(back_populates="events")


class TenantFeature(Base):
    """Per-tenant toggle for each PPE detection feature."""

    __tablename__ = "tenant_features"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True)
    feature_key: Mapped[str] = mapped_column(String(64))
    enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    # JSON-encoded list[int] of camera IDs this feature applies to.
    # Empty/None = feature inactive (must select at least one camera).
    camera_ids: Mapped[str | None] = mapped_column(Text, nullable=True)

    tenant: Mapped[Tenant] = relationship(back_populates="features")

    __table_args__ = (UniqueConstraint("tenant_id", "feature_key", name="uq_feature_tenant_key"),)


class LoadingUnloadingConfig(Base):
    """Per-tenant configuration for the Loading / Unloading Tracking feature.

    Stores the YOLO-World target object classes and the assigned/running camera
    lists so the worker can pick up changes without a restart. One row per
    tenant (unique constraint on tenant_id).
    """

    __tablename__ = "loading_unloading_configs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[str] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), index=True
    )
    enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    # "preset" | "custom" | "both"
    source: Mapped[str] = mapped_column(String(16), default="preset")
    # JSON-encoded list[str] of selected preset object names
    presets: Mapped[str | None] = mapped_column(Text, nullable=True)
    # JSON-encoded list[str] of user-added custom object names
    customs: Mapped[str | None] = mapped_column(Text, nullable=True)
    # JSON-encoded list[int] of camera IDs assigned to this tracking config.
    camera_ids: Mapped[str | None] = mapped_column(Text, nullable=True)
    # JSON-encoded dict[str, list[str]]: per-camera class overrides {"cam_id": ["bottle"]}
    camera_classes: Mapped[str | None] = mapped_column(Text, nullable=True)
    # JSON-encoded list[int] of camera IDs currently STARTED (counting actively
    # running). Subset of camera_ids. Start/Stop per camera drives this.
    running_camera_ids: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

    tenant: Mapped[Tenant] = relationship(back_populates="loading_config")

    __table_args__ = (
        UniqueConstraint("tenant_id", name="uq_loading_config_tenant"),
    )
