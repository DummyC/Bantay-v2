from fastapi import APIRouter, WebSocket, Depends, Query
from fastapi import WebSocketDisconnect
from typing import Optional

from core.security import oauth2_scheme, decode_token
from utils.websocket_manager import manager

router = APIRouter()


@router.websocket("/realtime")
async def ws_realtime(websocket: WebSocket, token: Optional[str] = Query(None)):
    # token may be sent as ?token=... or Authorization header; minimal auth here
    if token is None:
        await websocket.close(code=1008)
        return
    try:
        payload = decode_token(token)
    except Exception:
        await websocket.close(code=1008)
        return
    # only coast_guard should connect in typical usage, but we'll allow any authenticated
    await manager.connect(websocket, feed="realtime")
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket, feed="realtime")


@router.websocket("/events")
async def ws_events(websocket: WebSocket, token: Optional[str] = Query(None)):
    if token is None:
        await websocket.close(code=1008)
        return
    try:
        payload = decode_token(token)
    except Exception:
        await websocket.close(code=1008)
        return
    await manager.connect(websocket, feed="events")
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket, feed="events")
