from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class ReportCreate(BaseModel):
    event_id: int = Field(..., description="Associated SOS event id")
    resolution: str = Field(..., min_length=1, description="Resolution outcome")
    notes: Optional[str] = Field(None, description="Optional notes or custom resolution text")
    password: str = Field(..., min_length=1, description="Coast guard account password for confirmation")


class ReportOut(BaseModel):
    id: int
    event_id: int
    user_id: int
    resolution: str
    notes: Optional[str]
    timestamp: Optional[datetime]
    dismissal_time: Optional[datetime]

    model_config = ConfigDict(from_attributes=True)


class ReportWithDevice(ReportOut):
    device_id: Optional[int]
    device_name: Optional[str]
    owner_name: Optional[str]
    filed_by_name: Optional[str]
    event_timestamp: Optional[datetime]