import pytest

from core.security import hash_password
from db.session import SessionLocal
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
