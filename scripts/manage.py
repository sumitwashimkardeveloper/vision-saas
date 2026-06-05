"""Admin CLI for managing tenants, cameras, and people (Phase 2).

Examples:
    python -m scripts.manage tenant create --id tenant_001 --name "Acme HQ"
    python -m scripts.manage tenant list
    python -m scripts.manage tenant delete --id tenant_001
    python -m scripts.manage camera add --tenant tenant_001 --name "Front Door" --rtsp rtsp://...
    python -m scripts.manage camera list --tenant tenant_001
    python -m scripts.manage person add --tenant tenant_001 --key alice --name "Alice Smith" --role staff
    python -m scripts.manage person list --tenant tenant_001
    python -m scripts.manage events --tenant tenant_001 --limit 20
"""

from __future__ import annotations

import argparse
import logging

from apps.core.config import load_config
from apps.core.db import session_scope
from apps.core.repository import TenantRepository
from apps.core.tenant_service import (
    create_tenant,
    delete_tenant,
    list_tenants,
    tenant_summary,
)
from apps.core.user_service import create_user, list_users

logger = logging.getLogger("manage")


def _require_tenant(repo_session, tenant_id: str) -> None:
    if repo_session.get_tenant() is None:
        raise SystemExit(f"tenant '{tenant_id}' does not exist (create it first)")


def cmd_tenant_create(config, args) -> None:
    with session_scope(config) as s:
        create_tenant(config, s, args.id, args.name)
    print(f"tenant '{args.id}' ready")


def cmd_tenant_list(config, _args) -> None:
    with session_scope(config) as s:
        tenants = list_tenants(s)
        if not tenants:
            print("(no tenants)")
            return
        print(f"{'ID':<20} {'NAME':<24} {'PEOPLE':>6} {'CAMS':>5} {'EVENTS':>7}")
        for t in tenants:
            sm = tenant_summary(s, t.id)
            print(f"{t.id:<20} {t.name:<24} {sm.people:>6} {sm.cameras:>5} {sm.events:>7}")


def cmd_tenant_delete(config, args) -> None:
    with session_scope(config) as s:
        ok = delete_tenant(config, s, args.id, purge_files=not args.keep_files)
    print(f"deleted '{args.id}'" if ok else f"tenant '{args.id}' not found")


def cmd_camera_add(config, args) -> None:
    with session_scope(config) as s:
        repo = TenantRepository(s, args.tenant)
        _require_tenant(repo, args.tenant)
        cam = repo.upsert_camera(args.name, args.rtsp, enabled=not args.disabled)
        print(f"camera '{cam.name}' (id={cam.id}, enabled={cam.enabled}) saved for '{args.tenant}'")


def cmd_camera_list(config, args) -> None:
    with session_scope(config) as s:
        repo = TenantRepository(s, args.tenant)
        _require_tenant(repo, args.tenant)
        cams = repo.list_cameras()
        if not cams:
            print("(no cameras)")
            return
        for c in cams:
            print(f"  [{c.id}] {c.name:<24} enabled={c.enabled}  {c.rtsp_url}")


def cmd_person_add(config, args) -> None:
    with session_scope(config) as s:
        repo = TenantRepository(s, args.tenant)
        _require_tenant(repo, args.tenant)
        p = repo.upsert_person(args.key, args.name, role=args.role, details=args.details)
    # Make sure the enrollment image folder exists for the operator to drop photos in.
    folder = config.people_dir(args.tenant) / args.key
    folder.mkdir(parents=True, exist_ok=True)
    print(f"person '{p.name}' (key={p.external_key}) saved. Add images to: {folder}")
    print("Then rebuild the gallery: python -m scripts.build_gallery --tenant", args.tenant)


def cmd_person_list(config, args) -> None:
    with session_scope(config) as s:
        repo = TenantRepository(s, args.tenant)
        _require_tenant(repo, args.tenant)
        people = repo.list_people()
        if not people:
            print("(no people)")
            return
        for p in people:
            print(f"  {p.external_key:<16} {p.name:<24} role={p.role}")


def cmd_user_add(config, args) -> None:
    with session_scope(config) as s:
        repo = TenantRepository(s, args.tenant)
        _require_tenant(repo, args.tenant)
        try:
            u = create_user(s, args.tenant, args.username, args.password, role=args.role)
        except ValueError as exc:
            raise SystemExit(str(exc))
        print(f"user '{u.username}' (role={u.role}) created for tenant '{args.tenant}'")


def cmd_user_list(config, args) -> None:
    with session_scope(config) as s:
        repo = TenantRepository(s, args.tenant)
        _require_tenant(repo, args.tenant)
        users = list_users(s, args.tenant)
        if not users:
            print("(no users)")
            return
        for u in users:
            print(f"  {u.username:<20} role={u.role:<10} active={u.is_active}")


def cmd_events(config, args) -> None:
    with session_scope(config) as s:
        repo = TenantRepository(s, args.tenant)
        _require_tenant(repo, args.tenant)
        events = repo.list_events(limit=args.limit)
        if not events:
            print("(no events)")
            return
        for e in events:
            ts = e.ts.strftime("%Y-%m-%d %H:%M:%S") if e.ts else "?"
            print(f"  {ts}  {e.label:<24} score={e.score:.3f}  cam={e.camera_id}  {e.snapshot_path or ''}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Tenant/camera/person admin CLI")
    parser.add_argument("--config", help="Path to app.yaml")
    sub = parser.add_subparsers(dest="group", required=True)

    # tenant ...
    t = sub.add_parser("tenant").add_subparsers(dest="action", required=True)
    tc = t.add_parser("create"); tc.add_argument("--id", required=True); tc.add_argument("--name")
    tc.set_defaults(func=cmd_tenant_create)
    t.add_parser("list").set_defaults(func=cmd_tenant_list)
    td = t.add_parser("delete"); td.add_argument("--id", required=True)
    td.add_argument("--keep-files", action="store_true", help="keep on-disk data")
    td.set_defaults(func=cmd_tenant_delete)

    # camera ...
    c = sub.add_parser("camera").add_subparsers(dest="action", required=True)
    ca = c.add_parser("add")
    ca.add_argument("--tenant", required=True); ca.add_argument("--name", required=True)
    ca.add_argument("--rtsp", required=True); ca.add_argument("--disabled", action="store_true")
    ca.set_defaults(func=cmd_camera_add)
    cl = c.add_parser("list"); cl.add_argument("--tenant", required=True)
    cl.set_defaults(func=cmd_camera_list)

    # person ...
    p = sub.add_parser("person").add_subparsers(dest="action", required=True)
    pa = p.add_parser("add")
    pa.add_argument("--tenant", required=True); pa.add_argument("--key", required=True)
    pa.add_argument("--name", required=True); pa.add_argument("--role"); pa.add_argument("--details")
    pa.set_defaults(func=cmd_person_add)
    pl = p.add_parser("list"); pl.add_argument("--tenant", required=True)
    pl.set_defaults(func=cmd_person_list)

    # user ...
    u = sub.add_parser("user").add_subparsers(dest="action", required=True)
    ua = u.add_parser("add")
    ua.add_argument("--tenant", required=True); ua.add_argument("--username", required=True)
    ua.add_argument("--password", required=True); ua.add_argument("--role", default="admin")
    ua.set_defaults(func=cmd_user_add)
    ul = u.add_parser("list"); ul.add_argument("--tenant", required=True)
    ul.set_defaults(func=cmd_user_list)

    # events
    ev = sub.add_parser("events")
    ev.add_argument("--tenant", required=True); ev.add_argument("--limit", type=int, default=20)
    ev.set_defaults(func=cmd_events)

    return parser


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    parser = build_parser()
    args = parser.parse_args()
    config = load_config(args.config)
    args.func(config, args)


if __name__ == "__main__":
    main()
