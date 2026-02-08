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
from models.fisherfolk import Fisherfolk
from models.geofence import Geofence
from schemas.geofence import GeofenceOut, GeofenceCreate, GeofenceUpdate

router = APIRouter()

class RegisterDeviceIn(BaseModel):
    traccar_device_id: int
    unique_id: Optional[str]
    name: Optional[str]
    fisher_name: str
    fisher_email: EmailStr
    fisher_password: str
    medical_record: Optional[str] = None


class CoastGuardCreateIn(BaseModel):
    name: str
    email: EmailStr
    password: str


@router.post("/register")
def register(data: RegisterDeviceIn, db: Session = Depends(get_db), _=Depends(require_admin)):
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

    # ensure role exists and assign role_id
    from models.role import Role
    fisher_role = db.query(Role).filter(Role.name == "fisherfolk").first()
    if not fisher_role:
        fisher_role = Role(name="fisherfolk", description="Default fisherfolk role")
        db.add(fisher_role)
        db.flush()

    fisher = User(
        name=data.fisher_name,
        email=data.fisher_email,
        password_hash=hash_password(data.fisher_password),
        role_id=fisher_role.id,
    )
    db.add(fisher)
    db.flush()  # get fisher.id

    # create fisherfolk settings if not present (avoid UNIQUE constraint errors when
    # environment/module import timing causes duplicates during tests)
    existing_settings = db.query(Fisherfolk).filter(Fisherfolk.user_id == fisher.id).first()
    if not existing_settings:
        settings_obj = Fisherfolk(user_id=fisher.id, allow_history_access=False, medical_record=data.medical_record)
        db.add(settings_obj)

    # create device locally
    device = Device(
        traccar_device_id=data.traccar_device_id,
        unique_id=data.unique_id,
        name=data.name,
        user_id=fisher.id,
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
    # include fisherfolk settings/medical record in response when present
    ff = db.query(Fisherfolk).filter(Fisherfolk.user_id == fisher.id).first()
    med = ff.medical_record if ff else None

    return {"ok": True, "device": {"id": device.id, "traccar_device_id": device.traccar_device_id, "unique_id": device.unique_id, "user_id": device.user_id}, "fisherfolk": {"id": fisher.id, "email": fisher.email, "medical_record": med}}



@router.post("/register_fisher")
def register_fisher(data: RegisterDeviceIn, db: Session = Depends(get_db), _=Depends(require_admin)):
    """Alias for /register kept for clarity: register a fisherfolk and their device."""
    return register(data, db)


@router.post("/register_coastguard")
def register_coastguard(data: CoastGuardCreateIn, db: Session = Depends(get_db), _=Depends(require_admin)):
    """Create a coast guard user. This endpoint requires administrator privileges."""
    existing = db.query(User).filter(User.email == data.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    # ensure role exists and assign role_id
    from models.role import Role
    role_obj = db.query(Role).filter(Role.name == "coast_guard").first()
    if not role_obj:
        role_obj = Role(name="coast_guard", description="Coast guard role")
        db.add(role_obj)
        db.flush()

    user = User(name=data.name, email=data.email, password_hash=hash_password(data.password), role_id=role_obj.id)
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"ok": True, "user": {"id": user.id, "email": user.email, "role": user.role}}


@router.get("/users", response_model=list[UserOut])
def list_users(user_id: Optional[int] = None, email: Optional[str] = None, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    """List users or fetch a single user by id or email.

    - If `user_id` or `email` is provided, returns a single-element list with that user (or 404).
    - Otherwise returns all users.
    """
    def attach_med(u: User):
        # include medical_record only if allowed
        med = None
        try:
            from models.fisherfolk import Fisherfolk

            if can_view_medical(current_user, u.id):
                ff = db.query(Fisherfolk).filter(Fisherfolk.user_id == u.id).first()
                med = ff.medical_record if ff else None
        except Exception:
            med = None
        d = {
            "id": u.id,
            "name": u.name,
            "email": u.email,
            "role": u.role,
            "is_active": u.is_active,
            "created_at": u.created_at,
            "medical_record": med,
        }
        return d

    if user_id is not None:
        user = db.query(User).filter(User.id == int(user_id)).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        return [attach_med(user)]
    if email is not None:
        user = db.query(User).filter(User.email == email).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        return [attach_med(user)]
    users = db.query(User).all()
    return [attach_med(u) for u in users]


class UserCreateIn(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: str = "fisherfolk"
    medical_record: Optional[str] = None


class UserUpdateIn(BaseModel):
    name: Optional[str]
    email: Optional[EmailStr]
    password: Optional[str]
    role: Optional[str]
    is_active: Optional[bool]
    medical_record: Optional[str] = None


@router.post("/users", response_model=UserOut)
def create_user(data: UserCreateIn, db: Session = Depends(get_db), _=Depends(require_admin)):
    existing = db.query(User).filter(User.email == data.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user = User(name=data.name, email=data.email, password_hash=hash_password(data.password), role=data.role)
    db.add(user)
    db.commit()
    db.refresh(user)

    # if created user is a fisherfolk and a medical_record was provided, create fisherfolk record
    if (data.role or user.role) == "fisherfolk":
        existing_ff = db.query(Fisherfolk).filter(Fisherfolk.user_id == user.id).first()
        if not existing_ff:
            ff = Fisherfolk(user_id=user.id, allow_history_access=False, medical_record=data.medical_record)
            db.add(ff)
            db.commit()
    return user


@router.put("/users/{user_id}", response_model=UserOut)
def update_user(user_id: int, data: UserUpdateIn, db: Session = Depends(get_db), _=Depends(require_admin)):
    user = db.query(User).filter(User.id == int(user_id)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if data.name is not None:
        user.name = data.name
    if data.email is not None:
        # check uniqueness
        other = db.query(User).filter(User.email == data.email, User.id != user.id).first()
        if other:
            raise HTTPException(status_code=400, detail="Email already in use")
        user.email = data.email
    if data.password is not None:
        user.password_hash = hash_password(data.password)
    if data.role is not None:
        user.role = data.role
    if data.is_active is not None:
        user.is_active = data.is_active
    # If medical_record provided, create or update fisherfolk profile
    if data.medical_record is not None:
        ff = db.query(Fisherfolk).filter(Fisherfolk.user_id == user.id).first()
        if not ff:
            ff = Fisherfolk(user_id=user.id, allow_history_access=False, medical_record=data.medical_record)
            db.add(ff)
        else:
            ff.medical_record = data.medical_record

    db.commit()
    db.refresh(user)
    return user


@router.delete("/users/{user_id}")
def delete_user(user_id: int, delete_devices: bool = False, db: Session = Depends(get_db), _=Depends(require_admin)):
    """Delete a user. If `delete_devices=true` then also delete all devices owned by the user."""
    user = db.query(User).filter(User.id == int(user_id)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    deleted_devices = 0
    try:
        if delete_devices:
            deleted_devices = db.query(Device).filter(Device.user_id == user.id).delete(synchronize_session=False)
        db.delete(user)
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to delete user: {e}")
    return {"ok": True, "deleted_devices": deleted_devices}


@router.get("/devices")
def list_devices(device_id: Optional[int] = None, traccar_device_id: Optional[int] = None, unique_id: Optional[str] = None, db: Session = Depends(get_db), _=Depends(require_admin)):
    """List devices or fetch a single device by id, traccar_device_id or unique_id."""
    if device_id is not None:
        d = db.query(Device).filter(Device.id == int(device_id)).first()
        if not d:
            raise HTTPException(status_code=404, detail="Device not found")
        return d
    if traccar_device_id is not None:
        d = db.query(Device).filter(Device.traccar_device_id == int(traccar_device_id)).first()
        if not d:
            raise HTTPException(status_code=404, detail="Device not found")
        return d
    if unique_id is not None:
        d = db.query(Device).filter(Device.unique_id == unique_id).first()
        if not d:
            raise HTTPException(status_code=404, detail="Device not found")
        return d
    devices = db.query(Device).all()
    return devices


class DeviceCreateIn(BaseModel):
    traccar_device_id: Optional[int]
    unique_id: Optional[str]
    name: Optional[str]
    owner_id: Optional[int]


class DeviceUpdateIn(BaseModel):
    traccar_device_id: Optional[int]
    unique_id: Optional[str]
    name: Optional[str]
    owner_id: Optional[int]


@router.post("/devices")
def create_device(data: DeviceCreateIn, db: Session = Depends(get_db), _=Depends(require_admin)):
    device = Device(
        traccar_device_id=data.traccar_device_id,
        unique_id=data.unique_id,
        name=data.name,
        user_id=data.owner_id,
    )
    db.add(device)
    db.commit()
    db.refresh(device)
    return {"ok": True, "device": {"id": device.id, "traccar_device_id": device.traccar_device_id, "unique_id": device.unique_id, "user_id": device.user_id}}


@router.put("/devices/{device_id}")
def update_device(device_id: int, data: DeviceUpdateIn, db: Session = Depends(get_db), _=Depends(require_admin)):
    device = db.query(Device).filter(Device.id == int(device_id)).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    if data.traccar_device_id is not None:
        device.traccar_device_id = data.traccar_device_id
    if data.unique_id is not None:
        device.unique_id = data.unique_id
    if data.name is not None:
        device.name = data.name
    if data.owner_id is not None:
        # keep backward-compatible input field name 'owner_id' but store to 'user_id'
        device.user_id = data.owner_id
    db.commit()
    db.refresh(device)
    return {"ok": True, "device": {"id": device.id, "traccar_device_id": device.traccar_device_id, "unique_id": device.unique_id, "user_id": device.user_id}}


@router.delete("/devices/{device_id}")
def delete_device(device_id: int, delete_user: bool = False, db: Session = Depends(get_db), _=Depends(require_admin)):
    """Delete a device. If `delete_user=true` then also delete the device's owner user (if any)."""
    device = db.query(Device).filter(Device.id == int(device_id)).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    owner_deleted = False
    try:
        owner = None
        if delete_user and device.user_id is not None:
            owner = db.query(User).filter(User.id == device.user_id).first()
        db.delete(device)
        if owner and delete_user:
            db.delete(owner)
            owner_deleted = True
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to delete device: {e}")
    return {"ok": True, "owner_deleted": owner_deleted}


# Geofence CRUD


@router.get("/geofences", response_model=list[GeofenceOut])
def list_geofences(db: Session = Depends(get_db), _=Depends(require_admin)):
    geofences = db.query(Geofence).all()
    return geofences


@router.get("/geofences/{geofence_id}", response_model=GeofenceOut)
def get_geofence(geofence_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    g = db.query(Geofence).filter(Geofence.id == int(geofence_id)).first()
    if not g:
        raise HTTPException(status_code=404, detail="Geofence not found")
    return g


@router.post("/geofences", response_model=GeofenceOut)
def create_geofence(data: GeofenceCreate, db: Session = Depends(get_db), _=Depends(require_admin)):
    # respect TESTING env or explicit skip
    env_testing = os.environ.get("TESTING") in ("1", "true", "True")
    env_skip = os.environ.get("BANTAY_SKIP_TRACCAR") in ("1", "true", "True")
    if not (settings.TESTING or env_testing or env_skip) and (not settings.TRACCAR_API_URL or not settings.TRACCAR_API_TOKEN):
        raise HTTPException(status_code=400, detail="Traccar API URL and token must be configured to manage geofences")

    g = Geofence(name=data.name, description=data.description, area=data.area)
    db.add(g)
    db.flush()

    # create geofence in Traccar when configured
    if not (settings.TESTING or env_testing or env_skip):
        try:
            resp = requests.post(
                f"{settings.TRACCAR_API_URL.rstrip('/')}/api/geofences",
                json={"name": data.name, "description": data.description, "area": data.area},
                headers={"Authorization": f"Bearer {settings.TRACCAR_API_TOKEN}"},
                timeout=10,
            )
            resp.raise_for_status()
            traccar_data = resp.json()
            if isinstance(traccar_data, dict) and traccar_data.get("id"):
                g.traccar_id = traccar_data.get("id")
        except Exception as e:
            db.rollback()
            raise HTTPException(status_code=502, detail=f"Failed to create geofence in Traccar: {e}")

    db.commit()
    db.refresh(g)
    return g


@router.put("/geofences/{geofence_id}", response_model=GeofenceOut)
def update_geofence(geofence_id: int, data: GeofenceUpdate, db: Session = Depends(get_db), _=Depends(require_admin)):
    g = db.query(Geofence).filter(Geofence.id == int(geofence_id)).first()
    if not g:
        raise HTTPException(status_code=404, detail="Geofence not found")
    if data.name is not None:
        g.name = data.name
    if data.description is not None:
        g.description = data.description
    if data.area is not None:
        g.area = data.area
    # Traccar sync
    env_testing = os.environ.get("TESTING") in ("1", "true", "True")
    env_skip = os.environ.get("BANTAY_SKIP_TRACCAR") in ("1", "true", "True")
    if not (settings.TESTING or env_testing or env_skip):
        try:
            if g.traccar_id:
                resp = requests.put(
                    f"{settings.TRACCAR_API_URL.rstrip('/')}/api/geofences/{g.traccar_id}",
                    json={"name": g.name, "description": g.description, "area": g.area},
                    headers={"Authorization": f"Bearer {settings.TRACCAR_API_TOKEN}"},
                    timeout=10,
                )
                resp.raise_for_status()
            else:
                # create remote geofence if missing
                resp = requests.post(
                    f"{settings.TRACCAR_API_URL.rstrip('/')}/api/geofences",
                    json={"name": g.name, "description": g.description, "area": g.area},
                    headers={"Authorization": f"Bearer {settings.TRACCAR_API_TOKEN}"},
                    timeout=10,
                )
                resp.raise_for_status()
                traccar_data = resp.json()
                if isinstance(traccar_data, dict) and traccar_data.get("id"):
                    g.traccar_id = traccar_data.get("id")
        except Exception as e:
            db.rollback()
            raise HTTPException(status_code=502, detail=f"Failed to sync geofence with Traccar: {e}")

    db.commit()
    db.refresh(g)
    return g


@router.delete("/geofences/{geofence_id}")
def delete_geofence(geofence_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    g = db.query(Geofence).filter(Geofence.id == int(geofence_id)).first()
    if not g:
        raise HTTPException(status_code=404, detail="Geofence not found")
    try:
        # attempt to delete from Traccar first when configured
        env_testing = os.environ.get("TESTING") in ("1", "true", "True")
        env_skip = os.environ.get("BANTAY_SKIP_TRACCAR") in ("1", "true", "True")
        if g.traccar_id and not (settings.TESTING or env_testing or env_skip):
            try:
                resp = requests.delete(
                    f"{settings.TRACCAR_API_URL.rstrip('/')}/api/geofences/{g.traccar_id}",
                    headers={"Authorization": f"Bearer {settings.TRACCAR_API_TOKEN}"},
                    timeout=10,
                )
                resp.raise_for_status()
            except Exception:
                # don't fail deletion just because remote deletion failed; continue
                pass

        db.delete(g)
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to delete geofence: {e}")
    return {"ok": True}
