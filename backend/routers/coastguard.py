from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, aliased

from core.security import can_view_medical, get_current_user, get_db, require_coast_guard, verify_password
from models.device import Device
from models.event import Event
from models.report import Report
from models.log import Log
from models.user import User
from models.fisherfolk import Fisherfolk
from models.geofence import Geofence
from schemas.device import DeviceOut
from schemas.report import ReportCreate, ReportOut, ReportWithDevice
from schemas.user import UserOut
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


def _ensure_access_to_device(current_user: User, device: Device):
  if current_user.role in ("administrator", "coast_guard"):
    return
  # fisherfolk: only their own devices
  if device.user_id != current_user.id:
    raise HTTPException(status_code=403, detail="Not authorized for this device")


@router.get("/history")
def get_history(
  device_id: int,
  start: Optional[str] = None,
  end: Optional[str] = None,
  hours: int = 12,
  db: Session = Depends(get_db),
  current_user: User = Depends(get_current_user),
):
  device = db.query(Device).filter(Device.id == device_id).first()
  if not device:
    raise HTTPException(status_code=404, detail="Device not found")
  _ensure_access_to_device(current_user, device)

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

  end_dt = parse_ts(end)
  start_dt = parse_ts(start)

  # If explicit range provided, honor it; otherwise fall back to trailing hours window
  if not end_dt:
    end_dt = datetime.now(timezone.utc)
  if not start_dt:
    start_dt = end_dt - timedelta(hours=hours or 12)

  if start_dt > end_dt:
    start_dt, end_dt = end_dt, start_dt

  from models.position import Position

  history = (
    db.query(Position)
    .filter(Position.device_id == device_id)
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


def _is_sos_event(ev: Event) -> bool:
  et = (ev.event_type or "").lower()
  if "sos" in et:
    return True
  if isinstance(ev.attributes, dict):
    alarm = ev.attributes.get("alarm")
    if isinstance(alarm, str) and "sos" in alarm.lower():
      return True
  return False


@router.post("/reports", response_model=ReportOut)
def create_report(payload: ReportCreate, db: Session = Depends(get_db), current_user: User = Depends(require_coast_guard)):
  if not verify_password(payload.password, current_user.password_hash):
    raise HTTPException(status_code=401, detail="Invalid password")

  ev = db.query(Event).filter(Event.id == payload.event_id).first()
  if not ev:
    raise HTTPException(status_code=404, detail="Event not found")

  if not _is_sos_event(ev):
    raise HTTPException(status_code=400, detail="Reports can only be filed for SOS alarms")

  existing = db.query(Report).filter(Report.event_id == ev.id).first()
  if existing:
    raise HTTPException(status_code=400, detail="Report already exists for this event")

  resolution_text = payload.resolution.strip()
  notes = payload.notes.strip() if payload.notes else None
  ts = ev.timestamp or datetime.now(timezone.utc)

  report = Report(
    event_id=ev.id,
    user_id=current_user.id,
    resolution=resolution_text,
    notes=notes,
    timestamp=ts,
  )
  report.mark_dismissed_now()
  db.add(report)
  db.commit()
  db.refresh(report)
  _log_action(db, "reports", report.id, "create", actor_user_id=current_user.id, details={"event_id": ev.id, "resolution": resolution_text, "notes": notes})
  return report


@router.get("/reports", response_model=List[ReportWithDevice])
def list_reports(limit: int = 100, db: Session = Depends(get_db), _=Depends(require_coast_guard)):
  limit = min(max(limit, 1), 500)
  Reporter = aliased(User)
  Owner = aliased(User)
  rows = (
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
    .order_by(Report.timestamp.desc())
    .limit(limit)
    .all()
  )
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


@router.get("/reports/{event_id}", response_model=ReportWithDevice)
def get_report(event_id: int, db: Session = Depends(get_db), _=Depends(require_coast_guard)):
  Reporter = aliased(User)
  Owner = aliased(User)
  row = (
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
    .filter(Report.event_id == event_id)
    .first()
  )
  if not row:
    raise HTTPException(status_code=404, detail="Report not found")
  report, device_id, device_name, owner_name, filed_by_name, event_timestamp = row
  return {
    "id": report.id,
    "event_id": report.event_id,
    "user_id": report.user_id,
    "resolution": report.resolution,
    "notes": report.notes,
    "timestamp": report.timestamp,
    "dismissal_time": report.dismissal_time,
    "device_id": device_id,
    "device_name": device_name,
    "owner_name": owner_name,
    "filed_by_name": filed_by_name,
    "event_timestamp": event_timestamp,
  }
