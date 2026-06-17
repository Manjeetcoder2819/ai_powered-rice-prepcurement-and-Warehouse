from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from datetime import datetime
from app.core.database import get_db
from app.models.warehouse import StockModel, ZoneModel, LedgerModel
from app.models.price import VarietyPriceModel

router = APIRouter()

class LedgerCreate(BaseModel):
    variety: str
    qty_mt: float
    zone: str
    type: str
    operator: str = "System"

@router.get("/stock")
async def get_stock(db: AsyncSession = Depends(get_db)):
    stock_result = await db.execute(select(StockModel))
    stocks = stock_result.scalars().all()
    price_result = await db.execute(select(VarietyPriceModel))
    price_map = {item.variety: item.price_per_mt for item in price_result.scalars().all()}

    return [
        {
            "variety": s.variety,
            "qty_mt": s.qty_mt,
            "capacity_mt": s.capacity_mt,
            "zone": s.zone,
            "color": s.color,
            "price_per_mt": price_map.get(s.variety, 0.0),
            "stock_value": round(s.qty_mt * price_map.get(s.variety, 0.0), 2),
        }
        for s in stocks
    ]

@router.get("/zones")
async def get_zones(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ZoneModel))
    return [{"id":z.zone_id,"name":z.name,"variety":z.variety,"pct":z.pct,"temp_c":z.temp_c,"status":z.status,"label":z.label}
            for z in result.scalars().all()]

@router.get("/ledger")
async def get_ledger(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(LedgerModel).order_by(LedgerModel.id.desc()).limit(50))
    ledger = result.scalars().all()
    price_result = await db.execute(select(VarietyPriceModel))
    price_map = {item.variety: item.price_per_mt for item in price_result.scalars().all()}

    return [
        {
            "id": l.id,
            "time": l.time,
            "variety": l.variety,
            "qty_mt": l.qty_mt,
            "zone": l.zone,
            "type": l.type,
            "operator": l.operator,
            "price_per_mt": price_map.get(l.variety, 0.0),
            "estimated_value": round(l.qty_mt * price_map.get(l.variety, 0.0), 2),
        }
        for l in ledger
    ]

@router.post("/ledger")
async def add_ledger(data: LedgerCreate, db: AsyncSession = Depends(get_db)):
    now = datetime.now().strftime("%H:%M")
    entry = LedgerModel(time=now, variety=data.variety, qty_mt=data.qty_mt,
                        zone=data.zone, type=data.type, operator=data.operator)
    db.add(entry)
    # Update stock
    stock_r = await db.execute(select(StockModel).where(StockModel.variety == data.variety))
    stock = stock_r.scalars().first()
    if stock:
        if data.type == "Inflow":
            stock.qty_mt += data.qty_mt
        else:
            stock.qty_mt = max(0, stock.qty_mt - data.qty_mt)
    await db.commit()
    await db.refresh(entry)
    return {"id":entry.id,"time":entry.time,"variety":entry.variety,"qty_mt":entry.qty_mt,
            "zone":entry.zone,"type":entry.type,"operator":entry.operator}
