from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from core.security import get_current_user, require_coast_guard, get_db
from models.device import Device
from schemas.device import DeviceOut

router = APIRouter()


@router.get("/", response_model=List[DeviceOut])
def list_devices(db: Session = Depends(get_db)):
    devices = db.query(Device).all()
    return devices


@router.get("/{device_id}", response_model=DeviceOut)
def get_device(device_id: int, db: Session = Depends(get_db)):
    dev = db.query(Device).filter(Device.id == device_id).first()
    if not dev:
        raise HTTPException(status_code=404, detail="Device not found")
    return dev
