# app/models/gate_log.py
from sqlalchemy import Column, Integer, String, Float, DateTime
from sqlalchemy.sql import func
from app.core.database import Base


class GateLogModel(Base):
    __tablename__ = "gate_logs"
    id                = Column(Integer, primary_key=True, index=True)
    image_url         = Column(String, default="")
    detected_plate     = Column(String, default="")
    matched_vehicle_id = Column(String, default="")
    confidence         = Column(Float, default=0.0)
    decision           = Column(String, default="")  # allowed|denied|manual_review|wrong_slot
    booking_farmer_id  = Column(Integer, nullable=True)
    notes              = Column(String, default="")
    created_at         = Column(DateTime(timezone=True), server_default=func.now())
