from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from pydantic import ConfigDict


class DeviceOut(BaseModel):
    id: int
    traccar_device_id: Optional[int]
    unique_id: Optional[str]
    name: Optional[str]
    user_id: Optional[int]
    sim_number: Optional[str]
    geofence_id: Optional[int]
    created_at: Optional[datetime]
    updated_at: Optional[datetime]

    model_config = ConfigDict(from_attributes=True)
