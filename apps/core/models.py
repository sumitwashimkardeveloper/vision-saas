"""SQLAlchemy models. Every tenant-scoped table carries a ``tenant_id`` so the
schema is multi-tenant from day one (see docs/decisions.md ADR-002/003)."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import (
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
