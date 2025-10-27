from fastapi import FastAPI
from db.session import engine
from db.base import Base
from contextlib import asynccontextmanager

from routers import auth, admin, fisherfolk, devices, traccar, websocket
from core.config import settings
from core.security import hash_password
from db.session import SessionLocal
from models.user import User
import logging

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # startup: create tables
    Base.metadata.create_all(bind=engine)

    # create default admin user if configured and enabled
    try:
        if settings.ADMIN_CREATE_ON_STARTUP and settings.ADMIN_EMAIL and settings.ADMIN_PASSWORD:
            db = SessionLocal()
            try:
                existing = db.query(User).filter(User.email == settings.ADMIN_EMAIL).first()
                if not existing:
                    admin = User(
                        name=settings.ADMIN_NAME,
                        email=settings.ADMIN_EMAIL,
                        password_hash=hash_password(settings.ADMIN_PASSWORD),
                        role="administrator",
                    )
                    db.add(admin)
                    db.commit()
                    logger.info("Created default admin user %s", settings.ADMIN_EMAIL)
                else:
                    logger.debug("Default admin user already exists: %s", settings.ADMIN_EMAIL)
            finally:
                db.close()
    except Exception:
        # don't fail startup if admin creation fails; log the traceback
        import traceback

        logger.warning("Failed to create default admin on startup")
        logger.debug(traceback.format_exc())

    yield
    # shutdown: nothing for now


app = FastAPI(title="Fisherfolk Safety System API", lifespan=lifespan)


app.include_router(auth.router, prefix="/auth")
app.include_router(admin.router, prefix="/admin")
app.include_router(fisherfolk.router, prefix="/fisherfolk")
app.include_router(devices.router, prefix="/devices")
app.include_router(traccar.router, prefix="/traccar")
app.include_router(websocket.router, prefix="/ws")


@app.get("/")
def root():
    return {"message": "Fisherfolk Safety System API"}
