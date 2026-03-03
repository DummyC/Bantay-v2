import os
import pathlib
import pytest

# Force test-safe environment before importing app code
os.environ.setdefault("TESTING", "1")
os.environ.setdefault("DATABASE_URL", "sqlite:///./test_bantay.db")
os.environ.setdefault("TRACCAR_SHARED_SECRET", "test-traccar-secret")
os.environ.setdefault("SECRET_KEY", "test-secret-key")
# Skip outbound Traccar sync during tests
os.environ.setdefault("BANTAY_SKIP_TRACCAR", "1")

from fastapi.testclient import TestClient

from db.session import SessionLocal, engine
from db.base import Base
from models.role import Role
from models.user import User
from core.security import hash_password
from main import app


@pytest.fixture(scope="session", autouse=True)
def _prepare_test_db():
    # Always start with a fresh sqlite file so tests remain deterministic
    db_path = pathlib.Path("test_bantay.db")
    if db_path.exists():
        db_path.unlink()
    Base.metadata.create_all(bind=engine)
    yield
    try:
        db_path.unlink()
    except Exception:
        pass


@pytest.fixture(scope="function")
def db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(scope="function")
def seeded_roles(db_session):
    roles = {
        "administrator": "Administrator",
        "coast_guard": "Coast guard",
        "fisherfolk": "Fisherfolk",
    }
    for name, desc in roles.items():
        if not db_session.query(Role).filter(Role.name == name).first():
            db_session.add(Role(name=name, description=desc))
    db_session.commit()
    return roles


@pytest.fixture(scope="function")
def admin_user(db_session, seeded_roles):
    admin = db_session.query(User).filter(User.email == "admin@example.com").first()
    if not admin:
        admin = User(name="Admin", email="admin@example.com", password_hash=hash_password("adminpass"), role="administrator")
        db_session.add(admin)
        db_session.commit()
        db_session.refresh(admin)
    return admin


@pytest.fixture(scope="function")
def coast_guard_user(db_session, seeded_roles):
    user = db_session.query(User).filter(User.email == "cg@example.com").first()
    if not user:
        user = User(name="Coast Guard", email="cg@example.com", password_hash=hash_password("cgpass"), role="coast_guard")
        db_session.add(user)
        db_session.commit()
        db_session.refresh(user)
    return user


@pytest.fixture(scope="function")
def fisher_user(db_session, seeded_roles):
    user = db_session.query(User).filter(User.email == "fisher@example.com").first()
    if not user:
        user = User(name="Fisher", email="fisher@example.com", password_hash=hash_password("fishpass"), role="fisherfolk")
        db_session.add(user)
        db_session.commit()
        db_session.refresh(user)
    return user


@pytest.fixture(scope="function")
def client(db_session, seeded_roles):
    # FastAPI TestClient will reuse the global app; database points to the test sqlite file
    return TestClient(app)