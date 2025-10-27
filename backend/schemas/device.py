from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from pydantic import ConfigDict


class DeviceOut(BaseModel):
    id: int
    traccar_device_id: Optional[int]
    unique_id: Optional[str]
    name: Optional[str]
    owner_id: Optional[int]
    last_update: Optional[datetime]

    model_config = ConfigDict(from_attributes=True)
