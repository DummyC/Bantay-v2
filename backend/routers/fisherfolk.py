from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from core.security import require_fisherfolk, get_db, get_current_user
from models.fisherfolk import Fisherfolk
from models.user import User
from schemas.fisherfolk import FisherfolkOut, MedicalRecordIn

router = APIRouter()


class HistoryPermissionIn(BaseModel):
    allow_history_access: bool


@router.get("/settings")
def get_settings(current_user: User = Depends(require_fisherfolk), db: Session = Depends(get_db)):
    settings = db.query(Fisherfolk).filter(Fisherfolk.user_id == current_user.id).first()
    if not settings:
        return {"allow_history_access": False, "medical_record": None}
    return {"allow_history_access": settings.allow_history_access, "medical_record": settings.medical_record}


@router.put("/settings/history_permission")
def set_history_permission(payload: HistoryPermissionIn, current_user: User = Depends(require_fisherfolk), db: Session = Depends(get_db)):
    settings = db.query(Fisherfolk).filter(Fisherfolk.user_id == current_user.id).first()
    if not settings:
        settings = Fisherfolk(user_id=current_user.id, allow_history_access=payload.allow_history_access)
        db.add(settings)
    else:
        settings.allow_history_access = payload.allow_history_access
    db.commit()
    db.refresh(settings)
    return {"ok": True, "allow_history_access": settings.allow_history_access, "medical_record": settings.medical_record}


@router.get("/profile", response_model=FisherfolkOut)
def get_profile(current_user: User = Depends(require_fisherfolk), db: Session = Depends(get_db)):
    settings = db.query(Fisherfolk).filter(Fisherfolk.user_id == current_user.id).first()
    if not settings:
        raise HTTPException(status_code=404, detail="Fisherfolk profile not found")
    return settings


@router.put("/settings/medical_record")
def set_medical_record(payload: MedicalRecordIn, current_user: User = Depends(require_fisherfolk), db: Session = Depends(get_db)):
    settings = db.query(Fisherfolk).filter(Fisherfolk.user_id == current_user.id).first()
    if not settings:
        settings = Fisherfolk(user_id=current_user.id, allow_history_access=False, medical_record=payload.medical_record)
        db.add(settings)
    else:
        settings.medical_record = payload.medical_record
    db.commit()
    db.refresh(settings)
    return {"ok": True, "medical_record": settings.medical_record}
