from sqlalchemy import Column, Integer, String, Float, DateTime
from sqlalchemy.sql import func
from app.core.database import Base


class VarietyPriceModel(Base):
    __tablename__ = "variety_prices"
    id = Column(Integer, primary_key=True, index=True)
    variety = Column(String, unique=True, index=True, nullable=False)
    price_per_mt = Column(Float, nullable=False, default=0.0)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
