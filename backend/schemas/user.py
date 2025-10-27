from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from pydantic import ConfigDict


class UserOut(BaseModel):
    id: int
    name: str
    email: str
    role: str
    is_active: bool
    created_at: Optional[datetime]

    model_config = ConfigDict(from_attributes=True)


class UserCreate(BaseModel):
    name: str
    email: str
    password: str
    role: str = "fisherfolk"
