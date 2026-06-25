from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from app.core.database import get_db
from app.models.price import VarietyPriceModel
from app.services.prediction import price_summary

router = APIRouter()

class VarietyPriceCreate(BaseModel):
    variety: str
    price_per_kg: float


@router.get("")
async def get_variety_prices(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(VarietyPriceModel).order_by(VarietyPriceModel.variety))
    return [
        {"id": item.id, "variety": item.variety, "price_per_kg": item.price_per_kg}
        for item in result.scalars().all()
    ]


@router.post("")
async def upsert_variety_price(data: VarietyPriceCreate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(VarietyPriceModel).where(VarietyPriceModel.variety == data.variety))
    item = result.scalars().first()
    if item:
        item.price_per_kg = data.price_per_kg
    else:
        item = VarietyPriceModel(variety=data.variety, price_per_kg=data.price_per_kg)
        db.add(item)
    await db.commit()
    await db.refresh(item)
    return {"id": item.id, "variety": item.variety, "price_per_kg": item.price_per_kg}


@router.get("/summary")
async def get_price_summary(db: AsyncSession = Depends(get_db)):
    return await price_summary(db)
