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

from .models import Camera, Event, LoadingUnloadingConfig, Person, Tenant, TenantFeature


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

    def delete_camera(self, camera_id: int) -> bool:
        camera = self.get_camera(camera_id)
        if camera is None:
            return False
        self.session.delete(camera)
        self.session.flush()
        return True

    def delete_person(self, external_key: str) -> bool:
        person = self.get_person_by_key(external_key)
        if person is None:
            return False
        self.session.delete(person)
        self.session.flush()
        return True

    # ---- Features (PPE toggles) -------------------------------------------

    def list_features(self) -> list[TenantFeature]:
        stmt = (
            select(TenantFeature)
            .where(TenantFeature.tenant_id == self.tenant_id)
            .order_by(TenantFeature.feature_key)
        )
        return list(self.session.scalars(stmt).all())

    def get_feature(self, feature_key: str) -> TenantFeature | None:
        stmt = select(TenantFeature).where(
            TenantFeature.tenant_id == self.tenant_id,
            TenantFeature.feature_key == feature_key,
        )
        return self.session.scalars(stmt).first()

    def ensure_features(self) -> None:
        """Insert default (disabled) rows for any feature not yet in DB.
        Also removes stale rows whose keys are no longer in the registry."""
        from .ppe_registry import ALL_FEATURE_KEYS

        all_rows = self.list_features()
        existing_keys = {f.feature_key for f in all_rows}
        valid_keys = set(ALL_FEATURE_KEYS)

        # Remove stale rows from old registry versions.
        for row in all_rows:
            if row.feature_key not in valid_keys:
                self.session.delete(row)

        # Add missing rows for new keys (default disabled).
        for key in ALL_FEATURE_KEYS:
            if key not in existing_keys:
                self.session.add(
                    TenantFeature(tenant_id=self.tenant_id, feature_key=key, enabled=False)
                )
        self.session.flush()

    def toggle_feature(self, feature_key: str) -> TenantFeature | None:
        self.ensure_features()
        feat = self.get_feature(feature_key)
        if feat is None:
            return None
        feat.enabled = not feat.enabled
        self.session.add(feat)
        self.session.flush()
        return feat

    def set_feature_cameras(
        self, feature_key: str, camera_ids: list[int]
    ) -> TenantFeature | None:
        """Set the list of camera IDs a feature applies to (JSON-encoded)."""
        import json

        self.ensure_features()
        feat = self.get_feature(feature_key)
        if feat is None:
            return None
        # Keep only camera IDs that belong to this tenant.
        valid = {c.id for c in self.list_cameras()}
        clean = [cid for cid in camera_ids if cid in valid]
        feat.camera_ids = json.dumps(clean)
        self.session.add(feat)
        self.session.flush()
        return feat

    def get_enabled_feature_keys(self) -> set[str]:
        self.ensure_features()
        return {f.feature_key for f in self.list_features() if f.enabled}

    def get_enabled_features_for_camera(self, camera_id: int | None) -> set[str]:
        """Feature keys that are enabled AND assigned to this camera.

        Empty camera assignment means the feature is inactive (selection
        required), so a feature only applies to cameras explicitly listed.
        """
        import json

        if camera_id is None:
            return set()
        self.ensure_features()
        result: set[str] = set()
        for f in self.list_features():
            if not f.enabled:
                continue
            try:
                cam_ids = json.loads(f.camera_ids or "[]")
            except (ValueError, TypeError):
                cam_ids = []
            if camera_id in cam_ids:
                result.add(f.feature_key)
        return result

    # ---- Loading / Unloading config ---------------------------------------

    def get_loading_config(self) -> LoadingUnloadingConfig | None:
        stmt = select(LoadingUnloadingConfig).where(
            LoadingUnloadingConfig.tenant_id == self.tenant_id
        )
        return self.session.scalars(stmt).first()

    def upsert_loading_config(
        self,
        *,
        enabled: bool = False,
        source: str = "preset",
        presets: list[str] | None = None,
        customs: list[str] | None = None,
        camera_ids: list[int] | None = None,
        camera_classes: dict[str, list[str]] | None = None,
    ) -> LoadingUnloadingConfig:
        import json

        cfg = self.get_loading_config()
        if cfg is None:
            cfg = LoadingUnloadingConfig(tenant_id=self.tenant_id)
            self.session.add(cfg)

        cfg.enabled = enabled
        cfg.source = source
        cfg.presets = json.dumps(presets or [])
        cfg.customs = json.dumps(customs or [])
        new_camera_ids = camera_ids or []
        cfg.camera_ids = json.dumps(new_camera_ids)
        cfg.camera_classes = json.dumps(camera_classes or {})
        # Drop any running cameras that are no longer assigned.
        running = json.loads(cfg.running_camera_ids or "[]")
        cfg.running_camera_ids = json.dumps([c for c in running if c in new_camera_ids])
        self.session.flush()
        return cfg

    def set_loading_camera_running(
        self, camera_id: int, running: bool
    ) -> LoadingUnloadingConfig | None:
        """Start (running=True) or stop (running=False) counting for one camera."""
        import json

        cfg = self.get_loading_config()
        if cfg is None:
            return None
        current = json.loads(cfg.running_camera_ids or "[]")
        assigned = json.loads(cfg.camera_ids or "[]")
        ids = set(current)
        if running:
            if camera_id in assigned:
                ids.add(camera_id)
        else:
            ids.discard(camera_id)
        cfg.running_camera_ids = json.dumps(sorted(ids))
        self.session.flush()
        return cfg

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

    def search_events(
        self,
        label: str | None = None,
        camera_id: int | None = None,
        person_id: int | None = None,
        since: "datetime | None" = None,
        until: "datetime | None" = None,
        limit: int = 100,
    ) -> Sequence[Event]:
        """Filtered, tenant-scoped event query (Phase 5 timeline/search)."""
        stmt = select(Event).where(Event.tenant_id == self.tenant_id)
        if label:
            stmt = stmt.where(Event.label.ilike(f"%{label}%"))
        if camera_id is not None:
            stmt = stmt.where(Event.camera_id == camera_id)
        if person_id is not None:
            stmt = stmt.where(Event.person_id == person_id)
        if since is not None:
            stmt = stmt.where(Event.ts >= since)
        if until is not None:
            stmt = stmt.where(Event.ts <= until)
        stmt = stmt.order_by(Event.ts.desc()).limit(limit)
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
