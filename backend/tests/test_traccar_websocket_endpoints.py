import uuid
from datetime import datetime, timezone

from core.security import create_access_token
from db.session import SessionLocal
from models.device import Device
from models.event import Event
from models.position import Position
from utils.websocket_manager import manager


def _make_device(db, user_id: int, traccar_id: int):
    dev = Device(unique_id=f"DEV-{uuid.uuid4()}", name="WS Device", user_id=user_id, traccar_device_id=traccar_id)
    db.add(dev)
    db.commit()
    db.refresh(dev)
    return dev.id, dev.traccar_device_id


def _seed_position(db, device_id: int):
    pos = Position(device_id=device_id, latitude=14.5, longitude=120.9, speed=3.2, timestamp=datetime.now(timezone.utc))
    db.add(pos)
    db.commit()
    db.refresh(pos)
    return pos.id


def _seed_event(db, device_id: int, event_type: str = "alarm:sos"):
    ev = Event(device_id=device_id, event_type=event_type, attributes={"alarm": "sos"}, timestamp=datetime.now(timezone.utc))
    db.add(ev)
    db.commit()
    db.refresh(ev)
    return ev.id


def test_traccar_positions_saved_with_shared_secret(client, fisher_user):
    db = SessionLocal()
    try:
        device_id, traccar_id = _make_device(db, user_id=fisher_user.id, traccar_id=43210)
    finally:
        db.close()

    payload = [
        {
            "deviceId": traccar_id,
            "latitude": 14.6,
            "longitude": 120.98,
            "speed": 5.2,
            "fixTime": datetime.now(timezone.utc).isoformat(),
        }
    ]
    headers = {"Authorization": "Bearer test-traccar-secret"}

    resp = client.post("/api/traccar/positions", json=payload, headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body.get("ok") is True
    assert body.get("saved", 0) >= 1

    db2 = SessionLocal()
    try:
        rows = db2.query(Position).filter(Position.device_id == device_id).all()
        assert len(rows) >= 1
    finally:
        db2.close()


def test_traccar_events_map_device_unknown_to_offline(client, fisher_user):
    db = SessionLocal()
    try:
        device_id, traccar_id = _make_device(db, user_id=fisher_user.id, traccar_id=54321)
    finally:
        db.close()

    payload = {"deviceId": traccar_id, "type": "deviceUnknown", "attributes": {}}
    headers = {"Authorization": "Bearer test-traccar-secret"}

    resp = client.post("/api/traccar/events", json=payload, headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body.get("ok") is True

    db2 = SessionLocal()
    try:
        ev = db2.query(Event).filter(Event.device_id == device_id).order_by(Event.id.desc()).first()
        assert ev is not None
        assert ev.event_type == "deviceOffline"
    finally:
        db2.close()


def test_websocket_admin_receives_snapshot(client, admin_user, fisher_user):
    manager.active.clear()
    db = SessionLocal()
    try:
        device_id, _ = _make_device(db, user_id=fisher_user.id, traccar_id=65432)
        _seed_position(db, device_id)
        _seed_event(db, device_id, event_type="alarm:sos")
    finally:
        db.close()

    token = create_access_token({"sub": str(admin_user.id), "role": admin_user.role})

    with client.websocket_connect(f"/api/ws/socket?token={token}") as ws:
        msg = ws.receive_json()
        assert "positions" in msg and "events" in msg
        pos_ids = {p["device_id"] for p in msg["positions"]}
        assert device_id in pos_ids
        event_ids = {e["device_id"] for e in msg["events"]}
        assert device_id in event_ids


def test_websocket_filters_fisherfolk_to_own_devices(client, fisher_user, coast_guard_user):
    manager.active.clear()
    db = SessionLocal()
    try:
        fisher_device_id, _ = _make_device(db, user_id=fisher_user.id, traccar_id=76543)
        other_device_id, _ = _make_device(db, user_id=coast_guard_user.id, traccar_id=86543)
        _seed_position(db, fisher_device_id)
        _seed_event(db, fisher_device_id, event_type="deviceOffline")
        _seed_position(db, other_device_id)
        _seed_event(db, other_device_id, event_type="deviceOnline")
    finally:
        db.close()

    token = create_access_token({"sub": str(fisher_user.id), "role": fisher_user.role})

    with client.websocket_connect(f"/api/ws/socket?token={token}") as ws:
        msg = ws.receive_json()
        pos_ids = {p["device_id"] for p in msg.get("positions", [])}
        event_ids = {e["device_id"] for e in msg.get("events", [])}
        assert fisher_device_id in pos_ids
        assert other_device_id not in pos_ids
        assert fisher_device_id in event_ids
        assert other_device_id not in event_ids