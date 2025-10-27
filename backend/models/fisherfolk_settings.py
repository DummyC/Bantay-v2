from sqlalchemy import Column, Integer, Boolean, ForeignKey
from db.base import Base


class FisherfolkSettings(Base):
    __tablename__ = "fisherfolk_settings"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True)
    allow_history_access = Column(Boolean, default=False)
