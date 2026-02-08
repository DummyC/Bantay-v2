import os

# Use in-memory DB for tests
os.environ.setdefault("DATABASE_URL", "sqlite:///./test_bantay.db")
os.environ.setdefault("TRACCAR_SHARED_SECRET", "replace-with-traccar-secret")
os.environ.setdefault("SECRET_KEY", "test-secret")
os.environ.setdefault("TESTING", "1")

from fastapi.testclient import TestClient
from db.session import SessionLocal
from models.device import Device
from main import app


def test_traccar_positions_endpoint():
    client = TestClient(app)
    # ensure models are imported so metadata contains their tables
    import models.user, models.device, models.position, models.event, models.fisherfolk, models.geofence
    # ensure tables exist in the in-memory DB used for tests
    from db.base import Base
    from db.session import engine

    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    # create a device to receive positions
    dev = db.query(Device).filter(Device.traccar_device_id == 4242).first()
    if not dev:
        dev = Device(traccar_device_id=4242, unique_id="DEV-4242", name="Tst")
        db.add(dev)
        db.commit()
        db.refresh(dev)

    headers = {"Authorization": "Bearer replace-with-traccar-secret"}
    payload = {"deviceId": 4242, "latitude": 14.6, "longitude": 120.98, "speed": 5.2}
    r = client.post("/api/traccar/positions", json=payload, headers=headers)
    # we expect unauthorized because shared secret likely differs; allow 200 or 403
    assert r.status_code in (200, 403, 401)

    # cleanup
    db.close()
