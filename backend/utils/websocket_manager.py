from typing import List, Dict
from fastapi import WebSocket


class ConnectionManager:
    def __init__(self):
        # keep separate lists for realtime and events
        self.active: Dict[str, List[WebSocket]] = {"realtime": [], "events": []}

    async def connect(self, websocket: WebSocket, feed: str = "realtime"):
        await websocket.accept()
        if feed not in self.active:
            self.active[feed] = []
        self.active[feed].append(websocket)

    def disconnect(self, websocket: WebSocket, feed: str = "realtime"):
        if feed in self.active and websocket in self.active[feed]:
            self.active[feed].remove(websocket)

    async def broadcast(self, message: dict, feed: str = "realtime"):
        conns = list(self.active.get(feed, []))
        for connection in conns:
            try:
                await connection.send_json(message)
            except Exception:
                # best-effort: remove broken connections
                try:
                    self.active[feed].remove(connection)
                except ValueError:
                    pass


manager = ConnectionManager()
