# vehicle.py
from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean
from sqlalchemy.sql import func
from app.core.database import Base

class VehicleModel(Base):
    __tablename__ = "vehicles"
    id             = Column(Integer, primary_key=True)
    vehicle_id     = Column(String, unique=True, index=True)
    route          = Column(String, default="")
    load           = Column(String, default="")
    driver         = Column(String)
    driver_mobile  = Column(String)
    progress_pct   = Column(Integer, default=0)
    status         = Column(String, default="standby")  # enroute|standby|offline
    schedule_time  = Column(String, default="")
    updated_at     = Column(DateTime(timezone=True), onupdate=func.now())
