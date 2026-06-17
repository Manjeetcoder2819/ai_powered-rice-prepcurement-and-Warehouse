from sqlalchemy import Column, Integer, String, Boolean
from app.core.database import Base

class ChecklistModel(Base):
    __tablename__ = 'weather_checklist'

    id = Column(Integer, primary_key=True, index=True)
    text = Column(String, nullable=False)
    priority = Column(String, default='medium')
    done = Column(Boolean, default=False)
