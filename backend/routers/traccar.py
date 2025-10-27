from fastapi import APIRouter, Header, HTTPException, Depends, Body
from sqlalchemy.orm import Session
from typing import Any, List

from core.config import settings
from db.session import get_db
from models.device import Device
from models.position import Position
from models.event import Event
from utils.websocket_manager import manager

router = APIRouter()


def verify_shared_secret(authorization: str = Header(None)):
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization header")
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization header")
    token = authorization.split(" ", 1)[1]
    if token != settings.TRACCAR_SHARED_SECRET:
        raise HTTPException(status_code=403, detail="Invalid shared secret")


@router.post("/positions")
async def receive_positions(payload: Any = Body(...), db: Session = Depends(get_db), _=Depends(verify_shared_secret)):
    # Traccar can forward a list or a single object; handle simple cases
    items = []
    if isinstance(payload, list):
        items = payload
    elif isinstance(payload, dict):
        # sometimes payload has "positions" key
        items = payload.get("positions") or [payload]
    else:
        raise HTTPException(status_code=400, detail="Invalid payload")

    saved = []
    for it in items:
        device_id = it.get("deviceId") or it.get("device_id")
        if device_id is None:
            continue
        dev = db.query(Device).filter(Device.traccar_device_id == device_id).first()
        if not dev:
            # ignore unknown devices for now
            continue
        pos = Position(
            device_id=dev.id,
            latitude=it.get("latitude"),
            longitude=it.get("longitude"),
            speed=it.get("speed"),
            course=it.get("course"),
            fix_time=it.get("fixTime") or it.get("fix_time"),
            attributes=it.get("attributes"),
        )
        db.add(pos)
        saved.append(pos)
    db.commit()
    # broadcast to realtime websocket feed
    for pos in saved:
        db.refresh(pos)
        payload = {
            "type": "position",
            "deviceId": pos.device_id,
            "latitude": pos.latitude,
            "longitude": pos.longitude,
            "speed": pos.speed,
            "fixTime": str(pos.fix_time) if pos.fix_time else None,
        }
        # await broadcast to ensure coroutine is executed and avoid un-awaited warnings
        try:
            await manager.broadcast(payload, feed="realtime")
        except Exception:
            pass

    return {"ok": True, "saved": len(saved)}


@router.post("/events")
async def receive_events(payload: Any = Body(...), db: Session = Depends(get_db), _=Depends(verify_shared_secret)):
    items = []
    if isinstance(payload, list):
        items = payload
    elif isinstance(payload, dict):
        items = payload.get("events") or [payload]
    else:
        raise HTTPException(status_code=400, detail="Invalid payload")

    saved = []
    for it in items:
        device_id = it.get("deviceId") or it.get("device_id")
        if device_id is None:
            continue
        dev = db.query(Device).filter(Device.traccar_device_id == device_id).first()
        if not dev:
            continue
        ev = Event(device_id=dev.id, event_type=it.get("type") or it.get("eventType"), attributes=it.get("attributes"))
        db.add(ev)
        saved.append(ev)
    db.commit()

    for ev in saved:
        db.refresh(ev)
        payload = {
            "type": "event",
            "eventType": ev.event_type,
            "deviceId": ev.device_id,
            "timestamp": str(ev.server_time),
            "attributes": ev.attributes,
        }
        try:
            await manager.broadcast(payload, feed="events")
        except Exception:
            pass

    return {"ok": True, "saved": len(saved)}
