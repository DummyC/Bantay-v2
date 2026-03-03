import uuid

from db.session import SessionLocal
from models.device import Device


def test_devices_list_and_get(client, fisher_user):
    db = SessionLocal()
    try:
        device = Device(unique_id=f"DEV-{uuid.uuid4()}", name="Test Device", user_id=fisher_user.id, traccar_device_id=123456)
        db.add(device)
        db.commit()
        db.refresh(device)
        device_id = device.id
    finally:
        db.close()

    resp = client.get("/api/devices")
    assert resp.status_code == 200
    ids = {d["id"] for d in resp.json()}
    assert device_id in ids

    resp = client.get(f"/api/devices/{device_id}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["id"] == device_id
    assert body["unique_id"].startswith("DEV-")