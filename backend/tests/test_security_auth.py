import os
from fastapi.testclient import TestClient

# Set up testing env before importing the app and security helpers
os.environ.setdefault("TESTING", "1")

from db.base import Base
from db.session import engine, SessionLocal
from core.security import hash_password, verify_password
from models.user import User
from main import app


def _create_db(db_path: str):
    # Ensure a clean file-backed SQLite DB so TestClient and SQLAlchemy share it
    if os.path.exists(db_path):
        os.remove(db_path)
    open(db_path, "a").close()


def test_hash_truncate_and_verify(tmp_path):
    # long password larger than 72 bytes
    long_pw = "a" * 200
    h = hash_password(long_pw)
    assert h
    assert verify_password(long_pw, h) is True
    # Create a password that differs within the first 72 bytes so truncation
    # will produce a different value and verification should fail.
    long_pw_diff = "b" + long_pw[1:]
    assert verify_password(long_pw_diff, h) is False


def test_login_endpoint(tmp_path):
    test_db = str(tmp_path / "test_security.db")
    os.environ["DATABASE_URL"] = f"sqlite:///{test_db}"
    os.environ["TESTING"] = "1"

    # Recreate tables for this isolated test DB
    _create_db(test_db)
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        user = User(name="Tester", email="tester@example.com", password_hash=hash_password("s3cret"), role="fisherfolk")
        db.add(user)
        db.commit()
        db.refresh(user)
    finally:
        db.close()

    client = TestClient(app)
    r = client.post("/auth/login", json={"email": "tester@example.com", "password": "s3cret"})
    assert r.status_code == 200
    body = r.json()
    assert "access_token" in body
