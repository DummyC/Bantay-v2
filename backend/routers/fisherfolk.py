from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from core.security import require_fisherfolk, get_db, get_current_user
from models.fisherfolk_settings import FisherfolkSettings
from models.user import User

router = APIRouter()


class HistoryPermissionIn(BaseModel):
    allow_history_access: bool


@router.get("/settings")
def get_settings(current_user: User = Depends(require_fisherfolk), db: Session = Depends(get_db)):
    settings = db.query(FisherfolkSettings).filter(FisherfolkSettings.user_id == current_user.id).first()
    if not settings:
        return {"allow_history_access": False}
    return {"allow_history_access": settings.allow_history_access}


@router.put("/settings/history_permission")
def set_history_permission(payload: HistoryPermissionIn, current_user: User = Depends(require_fisherfolk), db: Session = Depends(get_db)):
    settings = db.query(FisherfolkSettings).filter(FisherfolkSettings.user_id == current_user.id).first()
    if not settings:
        settings = FisherfolkSettings(user_id=current_user.id, allow_history_access=payload.allow_history_access)
        db.add(settings)
    else:
        settings.allow_history_access = payload.allow_history_access
    db.commit()
    db.refresh(settings)
    return {"ok": True, "allow_history_access": settings.allow_history_access}
