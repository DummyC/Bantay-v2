from sqlalchemy import Column, Integer, Boolean, ForeignKey, Text
from db.base import Base


class Fisherfolk(Base):
    __tablename__ = "fisherfolk"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True)
    allow_history_access = Column(Boolean, default=True)
    # free-text medical record for current and past medical conditions
    medical_record = Column(Text, nullable=True)
