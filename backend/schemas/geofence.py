from pydantic import BaseModel
from typing import Optional
from pydantic import ConfigDict


class GeofenceOut(BaseModel):
    id: int
    name: str
    description: Optional[str]
    area: str
    traccar_id: Optional[int]

    model_config = ConfigDict(from_attributes=True)


class GeofenceCreate(BaseModel):
    name: str
    description: Optional[str] = None
    area: str


class GeofenceUpdate(BaseModel):
    name: Optional[str]
    description: Optional[str]
    area: Optional[str]
