from sqlalchemy import Column, Integer, String, ForeignKey, DateTime
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from db.base import Base


class Device(Base):
    __tablename__ = "devices"

    id = Column(Integer, primary_key=True, index=True)
    traccar_device_id = Column(Integer, unique=True, index=True)
    unique_id = Column(String, unique=True, index=True)
    name = Column(String, nullable=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    sim_number = Column(String, nullable=True)
    # use_alter to avoid metadata ordering issues when geofence model isn't imported
    geofence_id = Column(Integer, ForeignKey("geofences.id", use_alter=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    user = relationship("User")
    geofence = relationship("Geofence")
