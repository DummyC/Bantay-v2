from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.sql import func

from db.base import Base


class Report(Base):
    __tablename__ = "reports"

    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, ForeignKey("events.id"), nullable=False, unique=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    resolution = Column(String, nullable=False)
    notes = Column(Text, nullable=True)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    dismissal_time = Column(DateTime(timezone=True), nullable=True)

    def mark_dismissed_now(self):
        # Set dismissal_time using timezone-aware timestamp
        self.dismissal_time = datetime.now(timezone.utc)