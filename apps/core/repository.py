"""Tenant-scoped data access (the "Tenant Guard").

All reads/writes for tenant-owned tables go through a ``TenantRepository`` that
is bound to a single ``tenant_id`` at construction. Every query is filtered by
that id, so no caller can accidentally touch another tenant's data (ADR-003).
Do not query Camera/Person/Event directly elsewhere — go through here.
"""

from __future__ import annotations

from typing import Sequence

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import Camera, Event, Person, Tenant


class TenantRepository:
    def __init__(self, session: Session, tenant_id: str):
        self.session = session
        self.tenant_id = tenant_id

    # ---- Tenant -----------------------------------------------------------
    def get_tenant(self) -> Tenant | None:
        return self.session.get(Tenant, self.tenant_id)

    # ---- People -----------------------------------------------------------
    def list_people(self) -> Sequence[Person]:
        stmt = select(Person).where(Person.tenant_id == self.tenant_id).order_by(Person.name)
        return self.session.scalars(stmt).all()

    def get_person_by_key(self, external_key: str) -> Person | None:
        stmt = select(Person).where(
            Person.tenant_id == self.tenant_id, Person.external_key == external_key
        )
        return self.session.scalars(stmt).first()

    def upsert_person(
        self, external_key: str, name: str, role: str | None = None, details: str | None = None
    ) -> Person:
        person = self.get_person_by_key(external_key)
        if person is None:
            person = Person(
                tenant_id=self.tenant_id,
                external_key=external_key,
                name=name,
                role=role,
                details=details,
            )
            self.session.add(person)
        else:
            person.name = name
            person.role = role
            person.details = details
        self.session.flush()
        return person

    # ---- Cameras ----------------------------------------------------------
    def list_cameras(self, enabled_only: bool = False) -> Sequence[Camera]:
        stmt = select(Camera).where(Camera.tenant_id == self.tenant_id)
        if enabled_only:
            stmt = stmt.where(Camera.enabled.is_(True))
        return self.session.scalars(stmt.order_by(Camera.name)).all()

    def get_camera(self, camera_id: int) -> Camera | None:
        stmt = select(Camera).where(
            Camera.tenant_id == self.tenant_id, Camera.id == camera_id
        )
        return self.session.scalars(stmt).first()

    def upsert_camera(self, name: str, rtsp_url: str, enabled: bool = True) -> Camera:
        stmt = select(Camera).where(
            Camera.tenant_id == self.tenant_id, Camera.name == name
        )
        camera = self.session.scalars(stmt).first()
        if camera is None:
            camera = Camera(
                tenant_id=self.tenant_id, name=name, rtsp_url=rtsp_url, enabled=enabled
            )
            self.session.add(camera)
        else:
            camera.rtsp_url = rtsp_url
            camera.enabled = enabled
        self.session.flush()
        return camera

    # ---- Events -----------------------------------------------------------
    def add_event(
        self,
        label: str,
        score: float,
        camera_id: int | None = None,
        person_id: int | None = None,
        snapshot_path: str | None = None,
    ) -> Event:
        event = Event(
            tenant_id=self.tenant_id,
            camera_id=camera_id,
            person_id=person_id,
            label=label,
            score=score,
            snapshot_path=snapshot_path,
        )
        self.session.add(event)
        self.session.flush()
        return event

    def list_events(self, limit: int = 100) -> Sequence[Event]:
        stmt = (
            select(Event)
            .where(Event.tenant_id == self.tenant_id)
            .order_by(Event.ts.desc())
            .limit(limit)
        )
        return self.session.scalars(stmt).all()


def ensure_tenant(session: Session, tenant_id: str, name: str | None = None) -> Tenant:
    """Create the tenant row if missing. Not tenant-scoped on purpose: this is
    the one admin operation that brings a tenant into existence."""
    tenant = session.get(Tenant, tenant_id)
    if tenant is None:
        tenant = Tenant(id=tenant_id, name=name or tenant_id)
        session.add(tenant)
        session.flush()
    return tenant
