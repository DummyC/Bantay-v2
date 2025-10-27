from fastapi import APIRouter, Depends, HTTPException
import os
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from typing import Optional
import requests

from core.security import require_admin, get_db, hash_password
from core.config import settings
from schemas.user import UserOut
from models.user import User
from models.device import Device
from models.fisherfolk_settings import FisherfolkSettings

router = APIRouter()


class RegisterDeviceIn(BaseModel):
    traccar_device_id: int
    unique_id: Optional[str]
    name: Optional[str]
    fisher_name: str
    fisher_email: EmailStr
    fisher_password: str


@router.post("/register_device")
def register_device(data: RegisterDeviceIn, db: Session = Depends(get_db), _=Depends(require_admin)):
    # require Traccar API credentials unless testing
    env_testing = os.environ.get("TESTING") in ("1", "true", "True")
    # allow an explicit runtime bypass for tests or local runs
    env_skip = os.environ.get("BANTAY_SKIP_TRACCAR") in ("1", "true", "True")
    # Allow either the settings.TESTING flag or the runtime TESTING env var or explicit skip to indicate test mode.
    if not (settings.TESTING or env_testing or env_skip) and (not settings.TRACCAR_API_URL or not settings.TRACCAR_API_TOKEN):
        raise HTTPException(status_code=400, detail="Traccar API URL and token must be configured to register devices")

    # ensure fisherfolk user exists (or create)
    existing_user = db.query(User).filter(User.email == data.fisher_email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Fisherfolk email already registered")

    fisher = User(
        name=data.fisher_name,
        email=data.fisher_email,
        password_hash=hash_password(data.fisher_password),
        role="fisherfolk",
    )
    db.add(fisher)
    db.flush()  # get fisher.id

    # create fisherfolk settings if not present (avoid UNIQUE constraint errors when
    # environment/module import timing causes duplicates during tests)
    existing_settings = db.query(FisherfolkSettings).filter(FisherfolkSettings.user_id == fisher.id).first()
    if not existing_settings:
        settings_obj = FisherfolkSettings(user_id=fisher.id, allow_history_access=False)
        db.add(settings_obj)

    # create device locally
    device = Device(
        traccar_device_id=data.traccar_device_id,
        unique_id=data.unique_id,
        name=data.name,
        owner_id=fisher.id,
    )
    db.add(device)

    # Register device with Traccar (required in non-testing)
    if not (settings.TESTING or env_testing or env_skip):
        try:
            resp = requests.post(
                f"{settings.TRACCAR_API_URL.rstrip('/')}/api/devices",
                json={
                    "name": data.name or data.unique_id,
                    "uniqueId": data.unique_id,
                    "attributes": {"ownerEmail": data.fisher_email},
                },
                headers={"Authorization": f"Bearer {settings.TRACCAR_API_TOKEN}"},
                timeout=10,
            )
            resp.raise_for_status()
            traccar_data = resp.json()
            # If Traccar returned an id, update local device.traccar_device_id
            if isinstance(traccar_data, dict) and traccar_data.get("id"):
                device.traccar_device_id = traccar_data.get("id")
        except Exception as e:
            # rollback DB changes and report failure (strict transactional behavior)
            db.rollback()
            raise HTTPException(status_code=502, detail=f"Failed to register device with Traccar: {e}")

    db.commit()
    db.refresh(device)
    db.refresh(fisher)

    return {"ok": True, "device": {"id": device.id, "traccar_device_id": device.traccar_device_id, "unique_id": device.unique_id, "owner_id": device.owner_id}, "fisherfolk": {"id": fisher.id, "email": fisher.email}}


@router.get("/users", response_model=list[UserOut])
def list_users(db: Session = Depends(get_db), _=Depends(require_admin)):
    users = db.query(User).all()
    return users


@router.get("/devices")
def list_devices(db: Session = Depends(get_db), _=Depends(require_admin)):
    devices = db.query(Device).all()
    return devices
