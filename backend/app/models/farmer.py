# app/models/farmer.py
from sqlalchemy import Column, Integer, String, DateTime, Float
from sqlalchemy.sql import func
from app.core.database import Base

class FarmerModel(Base):
    __tablename__ = "farmers"
    id            = Column(Integer, primary_key=True, index=True)
    token         = Column(String, unique=True, index=True)
    name          = Column(String, nullable=False)
    mobile        = Column(String, nullable=False)
    village       = Column(String, default="")
    aadhaar_last4 = Column(String, default="")
    variety       = Column(String, nullable=False)
    bags          = Column(Integer, nullable=False)
    status        = Column(String, default="waiting")   # waiting|processing|done|alert
    wait_minutes  = Column(Integer, default=0)
    arrived_at    = Column(String, default="")
    email         = Column(String, default="")
    notes         = Column(String, default="")
    cultivated_area = Column(Float, default=0.0)
    harvest_date    = Column(String, default="")
    predicted_yield_kg = Column(Float, default=0.0)
    recommended_vehicle = Column(String, default="")
    slot_date       = Column(String, default="")
    slot_time       = Column(String, default="")
    assigned_vehicle = Column(String, default="")
    created_at    = Column(DateTime(timezone=True), server_default=func.now())
