from pydantic import BaseModel
from typing import Optional, Any
from datetime import datetime
from pydantic import ConfigDict


class PositionIn(BaseModel):
    deviceId: int
    latitude: float
    longitude: float
    speed: Optional[float]
    course: Optional[float]
    fixTime: Optional[datetime]
    attributes: Optional[Any]


class PositionOut(BaseModel):
    id: int
    device_id: int
    latitude: float
    longitude: float
    speed: Optional[float]
    course: Optional[float]
    fix_time: Optional[datetime]

    model_config = ConfigDict(from_attributes=True)
