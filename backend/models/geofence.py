from sqlalchemy import Column, Integer, String
from db.base import Base


class Geofence(Base):
    __tablename__ = "geofences"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)
    area = Column(String, nullable=False)  # WKT string
    traccar_id = Column(Integer, nullable=True)
