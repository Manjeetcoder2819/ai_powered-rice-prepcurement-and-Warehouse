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
    qty_kg: float
    zone: str
    type: str
    operator: str = "System"

@router.get("/stock")
async def get_stock(db: AsyncSession = Depends(get_db)):
    stock_result = await db.execute(select(StockModel))
    stocks = stock_result.scalars().all()
    price_result = await db.execute(select(VarietyPriceModel))
    price_map = {item.variety: item.price_per_kg for item in price_result.scalars().all()}

    return [
        {
            "variety": s.variety,
            "qty_kg": s.qty_kg,
            "capacity_kg": s.capacity_kg,
            "zone": s.zone,
            "color": s.color,
            "price_per_kg": price_map.get(s.variety, 0.0),
            "stock_value": round(s.qty_kg * price_map.get(s.variety, 0.0), 2),
        }
        for s in stocks
    ]

@router.get("/zones")
async def get_zones(db: AsyncSession = Depends(get_db)):
    zones_result = await db.execute(select(ZoneModel))
    zones = zones_result.scalars().all()
    
    stock_result = await db.execute(select(StockModel))
    stocks = stock_result.scalars().all()
    
    # Calculate utilization by zone based on stock vs capacity
    zone_stocks = {}
    for s in stocks:
        if s.zone not in zone_stocks:
            zone_stocks[s.zone] = {"qty": 0.0, "cap": 0.0}
        zone_stocks[s.zone]["qty"] += s.qty_kg or 0.0
        zone_stocks[s.zone]["cap"] += s.capacity_kg or 1000000.0
        
    for z in zones:
        if z.zone_id in zone_stocks:
            info = zone_stocks[z.zone_id]
            pct = round((info["qty"] / info["cap"]) * 100) if info["cap"] > 0 else 0
            z.pct = min(100, max(0, pct))
            # dynamically set status and label based on pct
            if z.pct > 85:
                z.status = "danger"
                z.label = "Critical Load"
            elif z.pct > 70:
                z.status = "warn"
                z.label = "High Load"
            else:
                z.status = "safe"
                z.label = "Normal"
                
    await db.commit()
    
    return [{"id":z.zone_id,"name":z.name,"variety":z.variety,"pct":z.pct,"temp_c":z.temp_c,"status":z.status,"label":z.label}
            for z in zones]

@router.get("/ledger")
async def get_ledger(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(LedgerModel).order_by(LedgerModel.id.desc()).limit(50))
    ledger = result.scalars().all()
    price_result = await db.execute(select(VarietyPriceModel))
    price_map = {item.variety: item.price_per_kg for item in price_result.scalars().all()}

    return [
        {
            "id": l.id,
            "time": l.time,
            "variety": l.variety,
            "qty_kg": l.qty_kg,
            "zone": l.zone,
            "type": l.type,
            "operator": l.operator,
            "price_per_kg": price_map.get(l.variety, 0.0),
            "estimated_value": round(l.qty_kg * price_map.get(l.variety, 0.0), 2),
        }
        for l in ledger
    ]

@router.post("/ledger")
async def add_ledger(data: LedgerCreate, db: AsyncSession = Depends(get_db)):
    now = datetime.now().strftime("%H:%M")
    entry = LedgerModel(time=now, variety=data.variety, qty_kg=data.qty_kg,
                        zone=data.zone, type=data.type, operator=data.operator)
    db.add(entry)
    # Update stock
    stock_r = await db.execute(select(StockModel).where(StockModel.variety == data.variety))
    stock = stock_r.scalars().first()
    if stock:
        if data.type == "Inflow":
            stock.qty_kg += data.qty_kg
        else:
            stock.qty_kg = max(0.0, stock.qty_kg - data.qty_kg)
            
    # Fetch price to return
    price_r = await db.execute(select(VarietyPriceModel).where(VarietyPriceModel.variety == data.variety))
    price_item = price_r.scalars().first()
    price_val = price_item.price_per_kg if price_item else 0.0
    est_value = round(data.qty_kg * price_val, 2)

    await db.commit()
    await db.refresh(entry)
    return {
        "id": entry.id,
        "time": entry.time,
        "variety": entry.variety,
        "qty_kg": entry.qty_kg,
        "zone": entry.zone,
        "type": entry.type,
        "operator": entry.operator,
        "price_per_kg": price_val,
        "estimated_value": est_value
    }

@router.delete("/ledger/{entry_id}")
async def delete_ledger(entry_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(LedgerModel).where(LedgerModel.id == entry_id))
    entry = result.scalars().first()
    if not entry:
        raise HTTPException(status_code=404, detail="Ledger entry not found")
        
    stock_r = await db.execute(select(StockModel).where(StockModel.variety == entry.variety))
    stock = stock_r.scalars().first()
    if stock:
        if entry.type == "Inflow":
            stock.qty_kg = max(0.0, stock.qty_kg - entry.qty_kg)
        else:
            stock.qty_kg += entry.qty_kg
            
    await db.delete(entry)
    await db.commit()
    return {"status": "success", "message": "Ledger entry deleted and stock reverted"}
