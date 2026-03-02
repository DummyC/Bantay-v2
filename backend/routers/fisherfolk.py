from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from core.security import require_fisherfolk, get_db, get_current_user
from models.device import Device
from models.fisherfolk import Fisherfolk
from models.position import Position
from models.user import User
from models.log import Log
from models.geofence import Geofence
from schemas.device import DeviceOut
from schemas.fisherfolk import FisherfolkOut, MedicalRecordIn
from schemas.geofence import GeofenceOut

router = APIRouter()


def _log_action(db: Session, table: str, record_id: int, action: str, actor_user_id: Optional[int] = None, details: Optional[dict] = None):
    try:
        entry = Log(table_name=table, record_id=record_id, action=action, actor_user_id=actor_user_id, details=details)
        db.add(entry)
        db.flush()
        db.commit()
    except Exception:
        db.rollback()
        raise


class HistoryPermissionIn(BaseModel):
    allow_history_access: bool


@router.get("/settings")
def get_settings(current_user: User = Depends(require_fisherfolk), db: Session = Depends(get_db)):
    settings = db.query(Fisherfolk).filter(Fisherfolk.user_id == current_user.id).first()
    if not settings:
        return {"allow_history_access": False, "medical_record": None}
    return {"allow_history_access": settings.allow_history_access, "medical_record": settings.medical_record}


@router.put("/settings/history_permission")
def set_history_permission(payload: HistoryPermissionIn, current_user: User = Depends(require_fisherfolk), db: Session = Depends(get_db)):
    settings = db.query(Fisherfolk).filter(Fisherfolk.user_id == current_user.id).first()
    if not settings:
        settings = Fisherfolk(user_id=current_user.id, allow_history_access=payload.allow_history_access)
        db.add(settings)
    else:
        settings.allow_history_access = payload.allow_history_access
    db.commit()
    db.refresh(settings)
    _log_action(db, "fisherfolk", settings.id, "update", actor_user_id=current_user.id, details={"allow_history_access": settings.allow_history_access})
    return {"ok": True, "allow_history_access": settings.allow_history_access, "medical_record": settings.medical_record}


@router.get("/profile", response_model=FisherfolkOut)
def get_profile(current_user: User = Depends(require_fisherfolk), db: Session = Depends(get_db)):
    settings = db.query(Fisherfolk).filter(Fisherfolk.user_id == current_user.id).first()
    if not settings:
        raise HTTPException(status_code=404, detail="Fisherfolk profile not found")
    return settings


@router.put("/settings/medical_record")
def set_medical_record(payload: MedicalRecordIn, current_user: User = Depends(require_fisherfolk), db: Session = Depends(get_db)):
    settings = db.query(Fisherfolk).filter(Fisherfolk.user_id == current_user.id).first()
    if not settings:
        settings = Fisherfolk(user_id=current_user.id, allow_history_access=False, medical_record=payload.medical_record)
        db.add(settings)
    else:
        settings.medical_record = payload.medical_record
    db.commit()
    db.refresh(settings)
    _log_action(db, "fisherfolk", settings.id, "update", actor_user_id=current_user.id, details={"medical_record": settings.medical_record})
    return {"ok": True, "medical_record": settings.medical_record}


@router.get("/devices", response_model=list[DeviceOut])
def list_my_devices(current_user: User = Depends(require_fisherfolk), db: Session = Depends(get_db)):
    devices = db.query(Device).filter(Device.user_id == current_user.id).all()
    return devices


@router.get("/geofences", response_model=list[GeofenceOut])
def list_my_geofences(current_user: User = Depends(require_fisherfolk), db: Session = Depends(get_db)):
    # Collect unique geofences tied to the fisherfolk's devices
    geofence_ids = {
        d.geofence_id for d in db.query(Device).filter(Device.user_id == current_user.id, Device.geofence_id.isnot(None)).all()
        if d.geofence_id is not None
    }
    if not geofence_ids:
        return []
    geofences = db.query(Geofence).filter(Geofence.id.in_(geofence_ids)).all()
    return geofences


@router.get("/history")
def history(
    device_id: int,
    hours: int = 12,
    start: Optional[str] = None,
    end: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_fisherfolk),
):
    device = db.query(Device).filter(Device.id == int(device_id), Device.user_id == current_user.id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found or not owned by you")

    def parse_ts(val: Optional[str]):
        if not val:
            return None
        try:
            dt = datetime.fromisoformat(val)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt
        except Exception:
            return None

    end_dt = parse_ts(end) or datetime.now(timezone.utc)
    start_dt = parse_ts(start) or (end_dt - timedelta(hours=hours or 12))

    history = (
        db.query(Position)
        .filter(Position.device_id == device.id)
        .filter(Position.timestamp.isnot(None))
        .filter(Position.timestamp >= start_dt)
        .filter(Position.timestamp <= end_dt)
        .order_by(Position.timestamp.asc())
        .all()
    )

    return [
        {
            "id": p.id,
            "device_id": p.device_id,
            "latitude": p.latitude,
            "longitude": p.longitude,
            "speed": p.speed,
            "course": p.course,
            "timestamp": p.timestamp.isoformat() if p.timestamp else None,
            "battery_percent": p.battery_percent,
            "attributes": p.attributes,
        }
        for p in history
    ]
