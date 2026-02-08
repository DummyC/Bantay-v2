from typing import List, Dict, Any
from fastapi import WebSocket


class ConnectionManager:
    def __init__(self):
        # single socket feed; store entries {ws, user_id, role}
        self.active: List[Dict[str, Any]] = []

    async def connect(self, websocket: WebSocket, user_id: int | None = None, role: str | None = None):
        await websocket.accept()
        self.active.append({"ws": websocket, "user_id": user_id, "role": role})

    def disconnect(self, websocket: WebSocket):
        self.active = [a for a in self.active if a.get("ws") is not websocket]

    async def broadcast(self, message: dict):
        # message is expected to be {"positions": [...], "events": [...]}
        conns = list(self.active)
        for entry in conns:
            ws = entry.get("ws")
            try:
                print(f"[ws manager] broadcasting message to one connection; keys={list(message.keys())}")
                await ws.send_json(message)
            except Exception:
                print("[ws manager] send error during broadcast; removing connection")
                try:
                    self.active.remove(entry)
                except ValueError:
                    pass

    async def send_to_user(self, websocket: WebSocket, message: dict):
        try:
            print(f"[ws manager] send_to_user: sending message with keys={list(message.keys())}")
            await websocket.send_json(message)
        except Exception as e:
            print(f"[ws manager] send_to_user error: {e}")
            # best-effort: remove broken connection(s)
            self.active = [a for a in self.active if a.get("ws") is not websocket]


manager = ConnectionManager()
