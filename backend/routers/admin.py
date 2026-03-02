from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
import os
import json
import xml.etree.ElementTree as ET
from sqlalchemy import or_
from sqlalchemy.orm import Session, aliased
from pydantic import BaseModel, ConfigDict, EmailStr
from typing import Optional
import requests

from core.security import require_admin, get_db, hash_password, can_view_medical
from core.config import settings
from schemas.user import UserOut
from models.user import User
from models.device import Device
from models.event import Event
from models.fisherfolk import Fisherfolk
from models.geofence import Geofence
from models.report import Report
from models.log import Log
from schemas.geofence import GeofenceOut, GeofenceCreate, GeofenceUpdate
from schemas.report import ReportWithDevice

router = APIRouter()

class RegisterDeviceIn(BaseModel):
    traccar_device_id: Optional[int] = None
    unique_id: Optional[str]
    name: Optional[str]
    fisher_name: str
    fisher_email: EmailStr
    fisher_password: str
    medical_record: Optional[str] = None
    geofence_id: Optional[int] = None


class CoastGuardCreateIn(BaseModel):
    name: str
    email: EmailStr
    password: str


class AdminCreateIn(BaseModel):
    name: str
    email: EmailStr
    password: str


class PasswordResetIn(BaseModel):
    new_password: str


def _traccar_enabled():
    env_testing = os.environ.get("TESTING") in ("1", "true", "True")
    env_skip = os.environ.get("BANTAY_SKIP_TRACCAR") in ("1", "true", "True")
    return not (settings.TESTING or env_testing or env_skip)


def _sync_device_geofence(traccar_device_id: Optional[int], new_geofence_id: Optional[int] = None, previous_geofence_id: Optional[int] = None, db: Session = None):
    if not traccar_device_id or db is None:
        return
    if not settings.TRACCAR_API_URL or not settings.TRACCAR_API_TOKEN:
        return
    if not _traccar_enabled():
        return

    new_traccar_id = None
    old_traccar_id = None
    if previous_geofence_id:
        old = db.query(Geofence).filter(Geofence.id == int(previous_geofence_id)).first()
        old_traccar_id = old.traccar_id if old else None
    if new_geofence_id:
        new = db.query(Geofence).filter(Geofence.id == int(new_geofence_id)).first()
        new_traccar_id = new.traccar_id if new else None

    headers = {"Authorization": f"Bearer {settings.TRACCAR_API_TOKEN}"}
    base = settings.TRACCAR_API_URL.rstrip("/")

    # remove old assignment if changed
    if old_traccar_id and old_traccar_id != new_traccar_id:
        try:
            requests.delete(
                f"{base}/api/permissions",
                params={"deviceId": traccar_device_id, "geofenceId": old_traccar_id},
                headers=headers,
                timeout=10,
            )
        except Exception:
            pass

    # add new assignment
    if new_traccar_id:
        requests.post(
            f"{base}/api/permissions",
            json={"deviceId": traccar_device_id, "geofenceId": new_traccar_id},
            headers=headers,
            timeout=10,
        )


def _sync_traccar_device(device: Device, db: Session, previous_unique_id: Optional[str] = None):
    if db is None:
        return
    if not _traccar_enabled():
        return
    if not settings.TRACCAR_API_URL or not settings.TRACCAR_API_TOKEN:
        return

    # unique_id is required to manage Traccar devices
    if not device.unique_id:
        return

    headers = {"Authorization": f"Bearer {settings.TRACCAR_API_TOKEN}"}
    base = settings.TRACCAR_API_URL.rstrip("/")
    payload = {
        "name": device.name or device.unique_id,
        "uniqueId": device.unique_id,
    }

    try:
        if device.traccar_device_id:
            requests.put(
                f"{base}/api/devices/{device.traccar_device_id}",
                json=payload,
                headers=headers,
                timeout=10,
            ).raise_for_status()
        else:
            resp = requests.post(
                f"{base}/api/devices",
                json=payload,
                headers=headers,
                timeout=10,
            )
            resp.raise_for_status()
            data = resp.json()
            if isinstance(data, dict) and data.get("id"):
                device.traccar_device_id = data.get("id")
                db.flush()
    except Exception:
        # Don't fail the main transaction because of Traccar sync issues
        pass


def _geojson_polygon_to_wkt(payload: dict) -> Optional[str]:
    def _extract_coords(obj):
        if not isinstance(obj, dict):
            return None
        t = obj.get("type")
        if t == "FeatureCollection":
            for feat in obj.get("features", []):
                coords = _extract_coords(feat)
                if coords:
                    return coords
        if t == "Feature":
            return _extract_coords(obj.get("geometry"))
        if t == "Polygon":
            coords = obj.get("coordinates") or []
            return coords[0] if coords else None
        if t == "MultiPolygon":
            coords = obj.get("coordinates") or []
            if coords and coords[0]:
                return coords[0][0]
        return None

    coords = _extract_coords(payload)
    if not coords:
        return None
    if not isinstance(coords, list) or len(coords) < 3:
        return None
    if coords[0] != coords[-1]:
        coords = coords + [coords[0]]
    parts = []
    for pt in coords:
        if not isinstance(pt, (list, tuple)) or len(pt) < 2:
            return None
        lon, lat = pt[0], pt[1]
        # Traccar expects (lat lon) ordering
        parts.append(f"{lat:.6f} {lon:.6f}")
    return f"POLYGON(({', '.join(parts)}))"


def _normalize_wkt_polygon(area_wkt: Optional[str]) -> Optional[str]:
    if not area_wkt:
        return None
    s = area_wkt.strip()
    if "polygon" not in s.lower():
        return None
    start = s.find("(")
    end = s.rfind(")")
    if start == -1 or end == -1 or end <= start:
        return None
    inner = s[start:end].strip().lstrip("(").rstrip(")")
    tokens = [t for t in inner.replace("\n", " ").split(",") if t.strip()]
    coords = []
    for tok in tokens:
        parts = [p for p in tok.strip().split(" ") if p]
        if len(parts) < 2:
            continue
        try:
            lon = float(parts[0])
            lat = float(parts[1])
        except ValueError:
            return None
        # heuristic: if first looks like lat (<=90) and second looks like lon (>90), swap
        if abs(lon) <= 90 and abs(lat) > 90:
            lon, lat = lat, lon
        # else if lon clearly >90 and lat within range, keep; otherwise assume lon,lat
        coords.append((lon, lat))
    if len(coords) < 3:
        return None
    # close ring if needed
    if abs(coords[0][0] - coords[-1][0]) > 1e-9 or abs(coords[0][1] - coords[-1][1]) > 1e-9:
        coords.append(coords[0])
    coord_str = ", ".join([f"{lat:.6f} {lon:.6f}" for lon, lat in coords])
    return f"POLYGON(({coord_str}))"


def _gpx_to_wkt(text: str) -> Optional[str]:
    if not text or "<gpx" not in text.lower():
        return None
    try:
        root = ET.fromstring(text)
    except Exception:
        return None
    ns = ""
    if root.tag.startswith("{") and "}" in root.tag:
        ns = root.tag.split("}")[0] + "}"
    pts = []
    for tag in ["trkpt", "rtept", "wpt"]:
        for el in root.findall(f".//{ns}{tag}"):
            lat = el.attrib.get("lat")
            lon = el.attrib.get("lon")
            if lat is None or lon is None:
                continue
            try:
                latf = float(lat)
                lonf = float(lon)
            except ValueError:
                continue
            pts.append((latf, lonf))
    if len(pts) < 3:
        return None
    if abs(pts[0][0] - pts[-1][0]) > 1e-9 or abs(pts[0][1] - pts[-1][1]) > 1e-9:
        pts.append(pts[0])
    coord_str = ", ".join([f"{lat:.6f} {lon:.6f}" for lat, lon in pts])
    return f"POLYGON(({coord_str}))"


@router.post("/register")
def register(data: RegisterDeviceIn, db: Session = Depends(get_db), _=Depends(require_admin)):
    # require Traccar API credentials unless testing
    env_testing = os.environ.get("TESTING") in ("1", "true", "True")
    # allow an explicit runtime bypass for tests or local runs
    env_skip = os.environ.get("BANTAY_SKIP_TRACCAR") in ("1", "true", "True")
    # Allow either the settings.TESTING flag or the runtime TESTING env var or explicit skip to indicate test mode.
    if not (settings.TESTING or env_testing or env_skip) and (not settings.TRACCAR_API_URL or not settings.TRACCAR_API_TOKEN):
        raise HTTPException(status_code=400, detail="Traccar API URL and token must be configured to register devices")

    geofence_obj = None
    if data.geofence_id is not None:
        geofence_obj = db.query(Geofence).filter(Geofence.id == int(data.geofence_id)).first()
        if not geofence_obj:
            raise HTTPException(status_code=404, detail="Geofence not found")

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
        traccar_device_id=None,
        unique_id=data.unique_id,
        name=data.name,
        user_id=fisher.id,
        geofence_id=data.geofence_id,
    )
    db.add(device)
    db.flush()

    # Register or sync device with Traccar (auto-assign traccar_device_id)
    if data.unique_id is None and _traccar_enabled():
        db.rollback()
        raise HTTPException(status_code=400, detail="unique_id is required to register device with Traccar")
    _sync_traccar_device(device, db=db)

    db.commit()
    db.refresh(device)
    db.refresh(fisher)
    # include fisherfolk settings/medical record in response when present
    ff = db.query(Fisherfolk).filter(Fisherfolk.user_id == fisher.id).first()
    med = ff.medical_record if ff else None

    # if geofence provided, attempt to sync to Traccar
    try:
        _sync_device_geofence(traccar_device_id=device.traccar_device_id, new_geofence_id=device.geofence_id, db=db)
    except Exception:
        pass

    return {
        "ok": True,
        "device": {
            "id": device.id,
            "traccar_device_id": device.traccar_device_id,
            "unique_id": device.unique_id,
            "user_id": device.user_id,
            "geofence_id": device.geofence_id,
        },
        "fisherfolk": {"id": fisher.id, "email": fisher.email, "medical_record": med},
    }



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


@router.post("/register_admin")
def register_admin(data: AdminCreateIn, db: Session = Depends(get_db), _=Depends(require_admin)):
    existing = db.query(User).filter(User.email == data.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    from models.role import Role

    role_obj = db.query(Role).filter(Role.name == "administrator").first()
    if not role_obj:
        role_obj = Role(name="administrator", description="Administrator")
        db.add(role_obj)
        db.flush()
    user = User(name=data.name, email=data.email, password_hash=hash_password(data.password), role_id=role_obj.id)
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"ok": True, "user": {"id": user.id, "email": user.email, "role": "administrator"}}


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
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    password: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None
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


@router.post("/users/{user_id}/reset_password")
def reset_password(user_id: int, data: PasswordResetIn, db: Session = Depends(get_db), _=Depends(require_admin)):
    user = db.query(User).filter(User.id == int(user_id)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.password_hash = hash_password(data.new_password)
    db.commit()
    return {"ok": True}


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
    traccar_device_id: Optional[int] = None
    unique_id: Optional[str] = None
    name: Optional[str] = None
    owner_id: Optional[int] = None
    geofence_id: Optional[int] = None


class DeviceUpdateIn(BaseModel):
    traccar_device_id: Optional[int] = None
    unique_id: Optional[str] = None
    name: Optional[str] = None
    owner_id: Optional[int] = None
    geofence_id: Optional[int] = None


class AlertOut(BaseModel):
    id: int
    device_id: int
    device_name: Optional[str]
    owner_name: Optional[str]
    event_type: str
    timestamp: Optional[datetime]
    attributes: Optional[dict]

    model_config = ConfigDict(from_attributes=True)


class LogOut(BaseModel):
    id: int
    table_name: str
    record_id: int
    action: str
    actor_user_id: Optional[int]
    actor_name: Optional[str]
    timestamp: Optional[datetime]
    details: Optional[dict]

    model_config = ConfigDict(from_attributes=True)


@router.post("/devices")
def create_device(data: DeviceCreateIn, db: Session = Depends(get_db), _=Depends(require_admin)):
    if data.geofence_id is not None:
        exists = db.query(Geofence).filter(Geofence.id == int(data.geofence_id)).first()
        if not exists:
            raise HTTPException(status_code=404, detail="Geofence not found")

    if _traccar_enabled() and not data.unique_id:
        raise HTTPException(status_code=400, detail="unique_id is required to create a device")

    device = Device(
        traccar_device_id=None,
        unique_id=data.unique_id,
        name=data.name,
        user_id=data.owner_id,
        geofence_id=data.geofence_id,
    )
    db.add(device)
    db.flush()

    _sync_traccar_device(device, db=db)
    db.commit()
    db.refresh(device)
    try:
        _sync_device_geofence(traccar_device_id=device.traccar_device_id, new_geofence_id=device.geofence_id, db=db)
    except Exception:
        pass
    return {
        "ok": True,
        "device": {
            "id": device.id,
            "traccar_device_id": device.traccar_device_id,
            "unique_id": device.unique_id,
            "user_id": device.user_id,
            "geofence_id": device.geofence_id,
        },
    }


@router.put("/devices/{device_id}")
def update_device(device_id: int, data: DeviceUpdateIn, db: Session = Depends(get_db), _=Depends(require_admin)):
    device = db.query(Device).filter(Device.id == int(device_id)).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    previous_geofence_id = device.geofence_id
    previous_unique_id = device.unique_id
    if data.traccar_device_id is not None:
        device.traccar_device_id = data.traccar_device_id
    if data.unique_id is not None:
        device.unique_id = data.unique_id
    if data.name is not None:
        device.name = data.name
    field_set = getattr(data, "model_fields_set", None) or getattr(data, "__fields_set__", set())
    if "owner_id" in field_set:
        # keep backward-compatible input field name 'owner_id' but store to 'user_id'
        device.user_id = data.owner_id
    if "geofence_id" in field_set:
        if data.geofence_id is not None:
            exists = db.query(Geofence).filter(Geofence.id == int(data.geofence_id)).first()
            if not exists:
                raise HTTPException(status_code=404, detail="Geofence not found")
        device.geofence_id = data.geofence_id
    db.commit()
    db.refresh(device)
    try:
        _sync_traccar_device(device, db=db, previous_unique_id=previous_unique_id)
    except Exception:
        pass
    try:
        _sync_device_geofence(
            traccar_device_id=device.traccar_device_id,
            new_geofence_id=device.geofence_id,
            previous_geofence_id=previous_geofence_id,
            db=db,
        )
    except Exception:
        pass
    return {
        "ok": True,
        "device": {
            "id": device.id,
            "traccar_device_id": device.traccar_device_id,
            "unique_id": device.unique_id,
            "user_id": device.user_id,
            "geofence_id": device.geofence_id,
        },
    }


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


@router.post("/geofences/upload", response_model=GeofenceOut)
async def upload_geofence(
    file: UploadFile = File(...),
    name: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    raw = await file.read()
    text = raw.decode("utf-8", errors="ignore").strip() if raw else ""
    area_wkt = None

    if text:
        try:
            payload = json.loads(text)
            area_wkt = _geojson_polygon_to_wkt(payload)
        except Exception:
            area_wkt = None
        if not area_wkt:
            area_wkt = _gpx_to_wkt(text) or text

    if not area_wkt or "polygon" not in area_wkt.lower():
        raise HTTPException(status_code=400, detail="Invalid geofence file; provide a GeoJSON polygon or WKT POLYGON text")

    normalized = _normalize_wkt_polygon(area_wkt)
    if not normalized:
        raise HTTPException(status_code=400, detail="Invalid geofence polygon format")

    g = Geofence(name=name or (file.filename or "Uploaded geofence"), description=description, area=normalized)
    db.add(g)
    db.flush()

    if _traccar_enabled():
        if not settings.TRACCAR_API_URL or not settings.TRACCAR_API_TOKEN:
            db.rollback()
            raise HTTPException(status_code=400, detail="Traccar API URL and token must be configured to manage geofences")
        try:
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
            raise HTTPException(status_code=502, detail=f"Failed to create geofence in Traccar: {e}")

    db.commit()
    db.refresh(g)
    return g


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

    normalized = _normalize_wkt_polygon(data.area)
    if not normalized:
        raise HTTPException(status_code=400, detail="Invalid geofence polygon format")

    g = Geofence(name=data.name, description=data.description, area=normalized)
    db.add(g)
    db.flush()

    # create geofence in Traccar when configured
    if not (settings.TESTING or env_testing or env_skip):
        try:
            resp = requests.post(
                f"{settings.TRACCAR_API_URL.rstrip('/')}/api/geofences",
                json={"name": data.name, "description": data.description, "area": normalized},
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
        normalized = _normalize_wkt_polygon(data.area)
        if not normalized:
            raise HTTPException(status_code=400, detail="Invalid geofence polygon format")
        g.area = normalized
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


@router.get("/alerts", response_model=list[AlertOut])
def list_alerts(
    q: Optional[str] = None,
    event_type: Optional[str] = None,
    device_id: Optional[int] = None,
    owner_id: Optional[int] = None,
    limit: int = 200,
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    limit = min(max(limit, 1), 500)
    Owner = aliased(User)
    query = (
        db.query(
            Event,
            Device.name.label("device_name"),
            Owner.name.label("owner_name"),
        )
        .join(Device, Device.id == Event.device_id)
        .join(Owner, Owner.id == Device.user_id, isouter=True)
    )

    if event_type:
        like = f"%{event_type}%"
        query = query.filter(Event.event_type.ilike(like))
    if device_id:
        query = query.filter(Event.device_id == device_id)
    if owner_id:
        query = query.filter(Device.user_id == owner_id)
    if q:
        like = f"%{q}%"
        query = query.filter(or_(Event.event_type.ilike(like), Device.name.ilike(like), Owner.name.ilike(like)))

    rows = query.order_by(Event.timestamp.desc()).limit(limit).all()
    return [
        {
            "id": ev.id,
            "device_id": ev.device_id,
            "device_name": device_name,
            "owner_name": owner_name,
            "event_type": ev.event_type,
            "timestamp": ev.timestamp,
            "attributes": ev.attributes,
        }
        for (ev, device_name, owner_name) in rows
    ]


@router.get("/reports", response_model=list[ReportWithDevice])
def list_reports_admin(
    q: Optional[str] = None,
    resolution: Optional[str] = None,
    device_id: Optional[int] = None,
    owner_id: Optional[int] = None,
    limit: int = 200,
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    limit = min(max(limit, 1), 500)
    Reporter = aliased(User)
    Owner = aliased(User)
    query = (
        db.query(
            Report,
            Event.device_id,
            Device.name.label("device_name"),
            Owner.name.label("owner_name"),
            Reporter.name.label("filed_by_name"),
            Event.timestamp.label("event_timestamp"),
        )
        .join(Event, Event.id == Report.event_id)
        .join(Device, Device.id == Event.device_id)
        .join(Owner, Owner.id == Device.user_id, isouter=True)
        .join(Reporter, Reporter.id == Report.user_id, isouter=True)
    )

    if resolution:
        like = f"%{resolution}%"
        query = query.filter(Report.resolution.ilike(like))
    if device_id:
        query = query.filter(Event.device_id == device_id)
    if owner_id:
        query = query.filter(Device.user_id == owner_id)
    if q:
        like = f"%{q}%"
        query = query.filter(
            or_(
                Report.resolution.ilike(like),
                Report.notes.ilike(like),
                Device.name.ilike(like),
                Owner.name.ilike(like),
                Reporter.name.ilike(like),
                Event.event_type.ilike(like),
            )
        )

    rows = query.order_by(Report.timestamp.desc()).limit(limit).all()
    return [
        {
            "id": r.id,
            "event_id": r.event_id,
            "user_id": r.user_id,
            "resolution": r.resolution,
            "notes": r.notes,
            "timestamp": r.timestamp,
            "dismissal_time": r.dismissal_time,
            "device_id": device_id,
            "device_name": device_name,
            "owner_name": owner_name,
            "filed_by_name": filed_by_name,
            "event_timestamp": event_timestamp,
        }
        for (r, device_id, device_name, owner_name, filed_by_name, event_timestamp) in rows
    ]


@router.get("/logs", response_model=list[LogOut])
def list_logs(
    table: Optional[str] = None,
    action: Optional[str] = None,
    actor_user_id: Optional[int] = None,
    q: Optional[str] = None,
    limit: int = 200,
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    limit = min(max(limit, 1), 500)
    Actor = aliased(User)
    query = db.query(Log, Actor.name.label("actor_name")).join(Actor, Actor.id == Log.actor_user_id, isouter=True)

    if table:
        query = query.filter(Log.table_name.ilike(f"%{table}%"))
    if action:
        query = query.filter(Log.action.ilike(f"%{action}%"))
    if actor_user_id:
        query = query.filter(Log.actor_user_id == actor_user_id)
    if q:
        like = f"%{q}%"
        query = query.filter(or_(Log.table_name.ilike(like), Log.action.ilike(like)))

    rows = query.order_by(Log.timestamp.desc()).limit(limit).all()
    return [
        {
            "id": log.id,
            "table_name": log.table_name,
            "record_id": log.record_id,
            "action": log.action,
            "actor_user_id": log.actor_user_id,
            "actor_name": actor_name,
            "timestamp": log.timestamp,
            "details": log.details,
        }
        for (log, actor_name) in rows
    ]
