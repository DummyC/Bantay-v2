from pydantic import BaseModel
from typing import Optional, Any
from datetime import datetime
from pydantic import ConfigDict


class EventIn(BaseModel):
    deviceId: int
    type: str
    timestamp: Optional[datetime]
    attributes: Optional[Any]


class EventOut(BaseModel):
    id: int
    device_id: int
    event_type: str
    server_time: Optional[datetime]
    attributes: Optional[Any]

    model_config = ConfigDict(from_attributes=True)
