import uuid
from datetime import datetime, timezone

import pytest

from db.session import SessionLocal
from models.device import Device
from models.event import Event
from models.position import Position
from models.user import User


def _auth_header(client, email, password):
    resp = client.post("/api/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _seed_device_with_positions(db, owner: User, geofence_id=None):
    uid = f"DEV-{uuid.uuid4()}"
    device = Device(unique_id=uid, name="Test Device", user_id=owner.id, geofence_id=geofence_id)
    db.add(device)
    db.commit()
    db.refresh(device)

    now = datetime.now(timezone.utc)
    pos = Position(device_id=device.id, latitude=14.6, longitude=120.98, speed=5.2, timestamp=now)
    db.add(pos)
    db.commit()
    return device.id


def _seed_sos_event(db, device_id: int):
    ev = Event(device_id=device_id, event_type="sos", timestamp=datetime.now(timezone.utc), attributes={"alarm": "sos"})
    db.add(ev)
    db.commit()
    db.refresh(ev)
    return ev


def test_coast_guard_lists_devices(client, coast_guard_user, fisher_user):
    db = SessionLocal()
    try:
        device_id = _seed_device_with_positions(db, owner=fisher_user)
    finally:
        db.close()

    headers = _auth_header(client, email=coast_guard_user.email, password="cgpass")
    resp = client.get("/api/coastguard/devices", headers=headers)
    assert resp.status_code == 200
    device_ids = {d["id"] for d in resp.json()}
    assert device_id in device_ids


def test_coast_guard_history_requires_access_and_returns_positions(client, coast_guard_user, fisher_user):
    db = SessionLocal()
    try:
        device_id = _seed_device_with_positions(db, owner=fisher_user)
    finally:
        db.close()

    headers = _auth_header(client, email=coast_guard_user.email, password="cgpass")
    resp = client.get(f"/api/coastguard/history?device_id={device_id}", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    assert data[0]["device_id"] == device_id


def test_coast_guard_can_file_report_for_sos_event(client, coast_guard_user, fisher_user):
    db = SessionLocal()
    try:
        device_id = _seed_device_with_positions(db, owner=fisher_user)
        event = _seed_sos_event(db, device_id)
    finally:
        db.close()

    headers = _auth_header(client, email=coast_guard_user.email, password="cgpass")
    payload = {"event_id": event.id, "resolution": "Assisted vessel", "notes": "Crew safe", "password": "cgpass"}
    resp = client.post("/api/coastguard/reports", json=payload, headers=headers)
    assert resp.status_code == 200
    report = resp.json()
    assert report["event_id"] == event.id
    assert report["resolution"] == "Assisted vessel"

    # list reports should include the newly filed one
    list_resp = client.get("/api/coastguard/reports", headers=headers)
    assert list_resp.status_code == 200
    event_ids = {r["event_id"] for r in list_resp.json()}
    assert event.id in event_ids


def test_coast_guard_report_rejects_non_sos_event(client, coast_guard_user, fisher_user):
    db = SessionLocal()
    try:
        device_id = _seed_device_with_positions(db, owner=fisher_user)
        non_sos = Event(device_id=device_id, event_type="geofenceEnter", timestamp=datetime.now(timezone.utc))
        db.add(non_sos)
        db.commit()
        db.refresh(non_sos)
    finally:
        db.close()

    headers = _auth_header(client, email=coast_guard_user.email, password="cgpass")
    payload = {"event_id": non_sos.id, "resolution": "Ignored", "notes": "", "password": "cgpass"}
    resp = client.post("/api/coastguard/reports", json=payload, headers=headers)
    assert resp.status_code == 400
    assert "Reports can only" in resp.text