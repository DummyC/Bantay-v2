from fastapi import APIRouter, Header, HTTPException, Depends, Body
from sqlalchemy.orm import Session
from typing import Any, List
from datetime import datetime, timezone

from core.config import settings
from db.session import get_db, SessionLocal
from models.device import Device
from models.position import Position
from models.event import Event
from utils.websocket_manager import manager
from sqlalchemy import func

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
        # normalize timestamp: Traccar may send milliseconds since epoch or ISO string
        ts = it.get("fixTime") or it.get("fix_time") or it.get("timestamp")
        ts_dt = None
        if isinstance(ts, (int, float)):
            # if large number assume milliseconds
            if ts > 1e12:
                ts_dt = datetime.fromtimestamp(ts / 1000.0, tz=timezone.utc)
            else:
                ts_dt = datetime.fromtimestamp(ts, tz=timezone.utc)
        else:
            try:
                if isinstance(ts, str) and ts:
                    ts_dt = datetime.fromisoformat(ts)
            except Exception:
                ts_dt = None

        pos = Position(
            device_id=dev.id,
            latitude=it.get("latitude"),
            longitude=it.get("longitude"),
            speed=it.get("speed"),
            course=it.get("course"),
            timestamp=ts_dt,
            battery_percent=it.get("batteryPercent") or it.get("battery_percent") or it.get("battery"),
            attributes=it.get("attributes"),
        )
        db.add(pos)
        saved.append(pos)
    db.commit()
    # refresh saved positions and build a positions list
    for pos in saved:
        db.refresh(pos)

    positions_payload = []
    for pos in saved:
        positions_payload.append({
            "id": pos.id,
            "device_id": pos.device_id,
            "latitude": pos.latitude,
            "longitude": pos.longitude,
            "speed": pos.speed,
            "timestamp": pos.timestamp.isoformat() if pos.timestamp else None,
            "battery_percent": pos.battery_percent,
            "attributes": pos.attributes,
        })

    # Broadcast combined message to connected socket clients, filtering per-user in this router
    try:
        # for each active connection, tailor message
        for entry in list(manager.active):
            ws = entry.get("ws")
            role = entry.get("role")
            user_id = entry.get("user_id")
            if role in ("administrator", "coast_guard"):
                msg = {"positions": positions_payload, "events": []}
                await manager.send_to_user(ws, msg)
            else:
                # fisherfolk: only positions for their devices
                db2 = SessionLocal()
                try:
                    device_ids = [d.id for d in db2.query(Device).filter(Device.user_id == int(user_id)).all()]
                    fp = [p for p in positions_payload if p["device_id"] in device_ids]
                    msg = {"positions": fp, "events": []}
                    await manager.send_to_user(ws, msg)
                finally:
                    db2.close()
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

    events_payload = []
    for ev in saved:
        events_payload.append({
            "id": ev.id,
            "device_id": ev.device_id,
            "event_type": ev.event_type,
            "timestamp": ev.timestamp.isoformat() if ev.timestamp else None,
            "attributes": ev.attributes,
        })

    try:
        for entry in list(manager.active):
            ws = entry.get("ws")
            role = entry.get("role")
            user_id = entry.get("user_id")
            if role in ("administrator", "coast_guard"):
                msg = {"positions": [], "events": events_payload}
                await manager.send_to_user(ws, msg)
            else:
                db2 = SessionLocal()
                try:
                    device_ids = [d.id for d in db2.query(Device).filter(Device.user_id == int(user_id)).all()]
                    fe = [e for e in events_payload if e["device_id"] in device_ids]
                    msg = {"positions": [], "events": fe}
                    await manager.send_to_user(ws, msg)
                finally:
                    db2.close()
    except Exception:
        pass

    return {"ok": True, "saved": len(saved)}
