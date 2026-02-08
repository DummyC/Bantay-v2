from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional

from core.security import require_coast_guard, get_db, can_view_medical
from models.device import Device
from models.user import User
from models.fisherfolk import Fisherfolk
from models.geofence import Geofence
from schemas.device import DeviceOut
from schemas.user import UserOut
from schemas.geofence import GeofenceOut

router = APIRouter()


@router.get("/devices", response_model=List[DeviceOut])
def list_devices(db: Session = Depends(get_db), _=Depends(require_coast_guard)):
  return db.query(Device).all()


@router.get("/users", response_model=List[UserOut])
def list_users(user_id: Optional[int] = None, email: Optional[str] = None, db: Session = Depends(get_db), current_user: User = Depends(require_coast_guard)):
  def attach_med(u: User):
    med = None
    try:
      if can_view_medical(current_user, u.id):
        ff = db.query(Fisherfolk).filter(Fisherfolk.user_id == u.id).first()
        med = ff.medical_record if ff else None
    except Exception:
      med = None
    return UserOut.model_validate({
      "id": u.id,
      "name": u.name,
      "email": u.email,
      "role": u.role,
      "is_active": u.is_active,
      "created_at": u.created_at,
      "medical_record": med,
    })

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


@router.get("/geofences", response_model=List[GeofenceOut])
def list_geofences(db: Session = Depends(get_db), _=Depends(require_coast_guard)):
  return db.query(Geofence).all()
