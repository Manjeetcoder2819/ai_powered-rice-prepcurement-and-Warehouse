from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.sql import func
from app.core.database import Base

class SMSLogModel(Base):
    __tablename__ = "sms_log"
    id        = Column(Integer, primary_key=True, index=True)
    type      = Column(String)   # queue|damage|rain|vehicle|complete|broadcast
    recipient = Column(String)
    mobile    = Column(String)
    message   = Column(String)
    status    = Column(String, default="delivered")  # delivered|pending|failed
    sent_at   = Column(String, default="")
    created_at= Column(DateTime(timezone=True), server_default=func.now())
