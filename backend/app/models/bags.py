# app/models/bags.py
from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean
from sqlalchemy.sql import func
from app.core.database import Base

class BatchModel(Base):
    __tablename__ = "batches"
    id               = Column(Integer, primary_key=True, index=True)
    batch_id         = Column(String, unique=True, index=True)
    farmer_name      = Column(String)
    farmer_mobile    = Column(String)
    variety          = Column(String, default="")
    total_bags       = Column(Integer, default=0)
    good             = Column(Integer, default=0)
    damaged          = Column(Integer, default=0)
    wet              = Column(Integer, default=0)
    damaged_indices  = Column(String, default="")   # comma-separated
    wet_indices      = Column(String, default="")
    deduction_amount = Column(Float, default=0.0)
    scanned_at       = Column(String, default="")
    status           = Column(String, default="Pending")   # "Pending", "Approved", "Rejected"
    created_at       = Column(DateTime(timezone=True), server_default=func.now())
