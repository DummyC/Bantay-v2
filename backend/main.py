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
from models.role import Role

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ensure all model modules are imported so their tables are registered
    # before creating metadata (prevents FK "table not found" errors)
    import models.device
    import models.geofence
    import models.position
    import models.event
    import models.log
    import models.fisherfolk
    import models.fisherfolk_settings

    # startup: create tables
    Base.metadata.create_all(bind=engine)

    # create default admin user if configured and enabled
    try:
        db = SessionLocal()
        try:
            # ensure default roles exist
            for rn, desc in [("administrator", "Administrator"), ("coast_guard", "Coast guard"), ("fisherfolk", "Fisherfolk")]:
                r = db.query(Role).filter(Role.name == rn).first()
                if not r:
                    r = Role(name=rn, description=desc)
                    db.add(r)
            db.commit()

            if settings.ADMIN_CREATE_ON_STARTUP and settings.ADMIN_EMAIL and settings.ADMIN_PASSWORD:
                existing = db.query(User).filter(User.email == settings.ADMIN_EMAIL).first()
                if not existing:
                    admin_role = db.query(Role).filter(Role.name == "administrator").first()
                    admin = User(
                        name=settings.ADMIN_NAME,
                        email=settings.ADMIN_EMAIL,
                        password_hash=hash_password(settings.ADMIN_PASSWORD),
                        role_id=admin_role.id if admin_role else None,
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


app.include_router(auth.router, prefix="/api/auth")
app.include_router(admin.router, prefix="/api/admin")
app.include_router(fisherfolk.router, prefix="/api/fisherfolk")
app.include_router(devices.router, prefix="/api/devices")
app.include_router(traccar.router, prefix="/api/traccar")
app.include_router(websocket.router, prefix="/api/ws")


# @app.get("/")
# def root():
#     return {"message": "Fisherfolk Safety System API - API mounted under /api"}
