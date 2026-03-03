import requests

from models.user import User


def _auth_header(client, email="admin@example.com", password="adminpass"):
    resp = client.post("/api/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_register_device_flow(client, admin_user, db_session, monkeypatch):
    payload = {
        "traccar_device_id": 9999,
        "unique_id": "TEST-9999",
        "name": "Test Vessel",
        "fisher_name": "Fisher One",
        "fisher_email": "fisher1@example.com",
        "fisher_password": "secret123",
    }

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
        return DummyResp({"id": payload["traccar_device_id"]})

    monkeypatch.setattr(requests, "post", fake_post)

    headers = _auth_header(client)
    resp = client.post("/api/admin/register", json=payload, headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body.get("ok") is True
    assert body.get("device")
    assert body["device"]["id"] is not None

    # cleanup created fisher to keep the shared sqlite DB clean for other tests
    fisher = db_session.query(User).filter(User.email == payload["fisher_email"]).first()
    if fisher:
        db_session.delete(fisher)
        db_session.commit()
