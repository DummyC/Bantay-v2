from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class FisherfolkOut(BaseModel):
    id: int
    user_id: int
    allow_history_access: bool
    medical_record: Optional[str]

    class Config:
        orm_mode = True


class MedicalRecordIn(BaseModel):
    medical_record: Optional[str]
