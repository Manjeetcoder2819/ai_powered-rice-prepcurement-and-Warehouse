from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean
from sqlalchemy.sql import func
from app.core.database import Base

class StockModel(Base):
    __tablename__ = "stock"
    id          = Column(Integer, primary_key=True)
    variety     = Column(String, unique=True, index=True)
    qty_kg      = Column(Float, default=0.0)
    capacity_kg = Column(Float, default=1000000.0)
    zone        = Column(String, default="A")
    color       = Column(String, default="#2e7d45")
    updated_at  = Column(DateTime(timezone=True), onupdate=func.now())

class ZoneModel(Base):
    __tablename__ = "zones"
    id      = Column(Integer, primary_key=True)
    zone_id = Column(String, unique=True, index=True)
    name    = Column(String)
    variety = Column(String)
    pct     = Column(Integer, default=0)
    temp_c  = Column(Integer, default=25)
    status  = Column(String, default="safe")   # safe|warn|danger
    label   = Column(String, default="Normal")

class LedgerModel(Base):
    __tablename__ = "ledger"
    id       = Column(Integer, primary_key=True, index=True)
    time     = Column(String)
    variety  = Column(String)
    qty_kg   = Column(Float)
    zone     = Column(String)
    type     = Column(String)   # Inflow | Outflow
    operator = Column(String, default="")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
