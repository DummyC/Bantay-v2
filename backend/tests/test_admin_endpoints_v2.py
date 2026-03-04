import pytest

from core.security import hash_password
from db.session import SessionLocal
from models.device import Device
from models.fisherfolk import Fisherfolk
from models.user import User


def _auth_header(client, email="admin@example.com", password="adminpass"):
    resp = client.post("/api/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_admin_can_register_coast_guard(client, admin_user):
    headers = _auth_header(client)
    payload = {"name": "CG One", "email": "cg1@example.com", "password": "cgpass123"}
    resp = client.post("/api/admin/register_coastguard", json=payload, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["ok"] is True
    assert data["user"]["email"] == payload["email"]
    assert data["user"]["role"] == "coast_guard"


def test_admin_can_register_admin(client, admin_user):
    headers = _auth_header(client)
    payload = {"name": "Admin Two", "email": "admin2@example.com", "password": "adminpass2"}
    resp = client.post("/api/admin/register_admin", json=payload, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["ok"] is True
    assert data["user"]["email"] == payload["email"]
    assert data["user"]["role"] == "administrator"


def test_admin_user_listing_includes_new_users(client, admin_user):
    headers = _auth_header(client)

    # seed an extra fisherfolk user
    db = SessionLocal()
    try:
        fisher = db.query(User).filter(User.email == "fisher@example.com").first()
        if not fisher:
            fisher = User(name="Fisher", email="fisher@example.com", password_hash=hash_password("fishpass"), role="fisherfolk")
            db.add(fisher)
            db.commit()
    finally:
        db.close()

    resp = client.get("/api/admin/users", headers=headers)
    assert resp.status_code == 200
    users = resp.json()
    emails = {u["email"] for u in users}
    assert "admin@example.com" in emails
    assert "fisher@example.com" in emails


def test_admin_can_assign_existing_device_to_new_fisher(client, admin_user, db_session, monkeypatch):
    monkeypatch.setenv("BANTAY_SKIP_TRACCAR", "1")
    monkeypatch.setenv("TESTING", "1")
    headers = _auth_header(client)

    device = Device(unique_id="DEV-ASSIGN", name="Unassigned Device", user_id=None, traccar_device_id=None)
    db_session.add(device)
    db_session.commit()
    db_session.refresh(device)

    user_payload = {
        "name": "Linked Fisher",
        "email": "linked_fisher@example.com",
        "password": "fishpass123",
        "role": "fisherfolk",
        "medical_record": "Allergic to shellfish",
    }
    user_resp = client.post("/api/admin/users", json=user_payload, headers=headers)
    assert user_resp.status_code == 200
    new_user_id = user_resp.json()["id"]

    update_resp = client.put(
        f"/api/admin/devices/{device.id}",
        json={"owner_id": new_user_id, "geofence_id": None},
        headers=headers,
    )
    assert update_resp.status_code == 200
    body = update_resp.json()["device"]
    assert body["user_id"] == new_user_id

    db_session.refresh(device)
    assert device.user_id == new_user_id

    fisher_profile = db_session.query(Fisherfolk).filter(Fisherfolk.user_id == new_user_id).first()
    assert fisher_profile is not None
    assert fisher_profile.medical_record == user_payload["medical_record"]

    if fisher_profile:
        db_session.delete(fisher_profile)
    db_session.delete(device)
    db_session.query(User).filter(User.id == new_user_id).delete()
    db_session.commit()
