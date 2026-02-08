from fastapi import APIRouter, WebSocket, Depends, Query
from fastapi import WebSocketDisconnect
from typing import Optional

from core.security import decode_token
from utils.websocket_manager import manager
from db.session import SessionLocal
from sqlalchemy.orm import Session
from models.position import Position
from models.event import Event
from models.device import Device
from sqlalchemy import func
from datetime import datetime

router = APIRouter()


@router.websocket("/socket")
async def ws_socket(websocket: WebSocket, token: Optional[str] = Query(None)):
    # token must be provided and valid; decode to determine user id and role
    if token is None:
        await websocket.close(code=1008)
        return
    try:
        payload = decode_token(token)
    except Exception:
        await websocket.close(code=1008)
        return

    user_id = int(payload.get("sub")) if payload.get("sub") else None
    role = payload.get("role")

    # register connection with metadata
    await manager.connect(websocket, user_id=user_id, role=role)

    # on connect: send initial snapshot
    try:
        db: Session = SessionLocal()
        # latest positions: latest position per device
        subq = db.query(func.max(Position.id).label("max_id")).group_by(Position.device_id).subquery()
        latest_positions = db.query(Position).join(subq, Position.id == subq.c.max_id).all()

        # recent events (most recent 100, chronological)
        recent_events = db.query(Event).order_by(Event.id.desc()).limit(100).all()[::-1]

        # filter according to role/user
        def pos_to_dict(p: Position):
            return {
                "id": p.id,
                "device_id": p.device_id,
                "latitude": p.latitude,
                "longitude": p.longitude,
                "speed": p.speed,
                "timestamp": p.timestamp.isoformat() if p.timestamp else None,
                "battery_percent": p.battery_percent,
                "attributes": p.attributes,
            }

        def ev_to_dict(e: Event):
            return {
                "id": e.id,
                "device_id": e.device_id,
                "event_type": e.event_type,
                "timestamp": e.timestamp.isoformat() if e.timestamp else None,
                "attributes": e.attributes,
            }

        if role in ("administrator", "coast_guard"):
            msg = {"positions": [pos_to_dict(p) for p in latest_positions], "events": [ev_to_dict(e) for e in recent_events]}
            print(f"[ws socket] sending initial snapshot to role={role}; positions={len(latest_positions)} events={len(recent_events)}")
            await manager.send_to_user(websocket, msg)
        else:
            # fisherfolk: only positions/events for their devices
            device_ids = [d.id for d in db.query(Device).filter(Device.user_id == user_id).all()]
            fp = [p for p in latest_positions if p.device_id in device_ids]
            fe = [e for e in recent_events if e.device_id in device_ids]
            msg = {"positions": [pos_to_dict(p) for p in fp], "events": [ev_to_dict(e) for e in fe]}
            print(f"[ws socket] sending initial snapshot to user_id={user_id}; positions={len(fp)} events={len(fe)}")
            await manager.send_to_user(websocket, msg)
    finally:
        db.close()

    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
