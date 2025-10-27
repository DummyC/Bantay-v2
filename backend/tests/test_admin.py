import os

# Use isolated in-memory DB for tests and set test secrets before importing app
os.environ.setdefault("DATABASE_URL", "sqlite:///./test_bantay.db")
os.environ.setdefault("TRACCAR_SHARED_SECRET", "replace-with-traccar-secret")
os.environ.setdefault("SECRET_KEY", "test-secret")
# Ensure TESTING is explicitly enabled for this test module
os.environ["TESTING"] = "1"
import requests

from fastapi.testclient import TestClient
from db.session import SessionLocal
from core.security import hash_password
from models.user import User

from main import app


def ensure_admin(db):
    admin = db.query(User).filter(User.email == "admin@example.com").first()
    if not admin:
        admin = User(name="Admin", email="admin@example.com", password_hash=hash_password("adminpass"), role="administrator")
        db.add(admin)
        db.commit()
        db.refresh(admin)
    return admin


def test_register_device_flow(monkeypatch):
    client = TestClient(app)
    # ensure models are imported so metadata contains their tables
    import models.user, models.device, models.position, models.event, models.fisherfolk_settings
    # ensure tables exist in the in-memory DB used for tests
    from db.base import Base
    from db.session import engine
    # ensure a clean file-backed test DB for the suite
    import os
    test_db = "./test_bantay.db"
    if os.path.exists(test_db):
        os.remove(test_db)

    # create an empty file with permissive permissions so SQLite can write to it
    open(test_db, "a").close()
    try:
        os.chmod(test_db, 0o666)
    except Exception:
        pass

    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    admin = ensure_admin(db)
    # login
    r = client.post("/auth/login", json={"email": "admin@example.com", "password": "adminpass"})
    assert r.status_code == 200
    token = r.json()["access_token"]

    headers = {"Authorization": f"Bearer {token}"}
    payload = {
        "traccar_device_id": 9999,
        "unique_id": "TEST-9999",
        "name": "Test Vessel",
        "fisher_name": "Fisher One",
        "fisher_email": "fisher1@example.com",
        "fisher_password": "secret123",
    }
    # Mock the Traccar API call to return success so the admin flow remains transactional
    class DummyResp:
        def __init__(self, data, status=200):
            self._data = data
            self.status_code = status

        def raise_for_status(self):
            if not (200 <= self.status_code < 300):
                raise requests.HTTPError(f"status {self.status_code}")

        def json(self):
            return self._data

    def fake_post(url, json=None, headers=None, timeout=None):
        # simulate Traccar created device with id
        return DummyResp({"id": payload["traccar_device_id"]})

    monkeypatch.setattr(requests, "post", fake_post)

    r = client.post("/admin/register_device", json=payload, headers=headers)
    assert r.status_code == 200
    body = r.json()
    assert body.get("ok") is True
    # device traccar id may be set by Traccar or equal to provided; check presence
    assert "device" in body

    # cleanup created fisher
    from models.user import User as U
    f = db.query(U).filter(U.email == "fisher1@example.com").first()
    if f:
        db.delete(f)
        db.commit()

    db.close()
