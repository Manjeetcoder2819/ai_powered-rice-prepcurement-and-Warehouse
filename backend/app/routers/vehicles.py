from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
from app.core.database import get_db
from app.models.vehicle import VehicleModel
from app.services.vehicle_ai import load_route_plans, route_plan_to_message

router = APIRouter()

class VehicleCreate(BaseModel):
    id: str
    driver: str
    driver_mobile: str = ""
    route: str = ""
    load: str = ""
    schedule_time: str = ""
    status: str = "standby"

class VehicleUpdate(BaseModel):
    route: Optional[str] = None
    load: Optional[str] = None
    driver: Optional[str] = None
    driver_mobile: Optional[str] = None
    progress_pct: Optional[int] = None
    status: Optional[str] = None
    schedule_time: Optional[str] = None

def v_dict(v: VehicleModel) -> dict:
    return {
        "id": v.vehicle_id, "route": v.route, "load": v.load,
        "driver": v.driver, "driver_mobile": v.driver_mobile,
        "progress_pct": v.progress_pct, "status": v.status,
        "schedule_time": v.schedule_time or "",
    }

@router.get("")
async def get_vehicles(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(VehicleModel).order_by(VehicleModel.id))
    return [v_dict(v) for v in result.scalars().all()]

@router.post("")
async def create_vehicle(data: VehicleCreate, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(VehicleModel).where(VehicleModel.vehicle_id == data.id))
    if existing.scalars().first():
        raise HTTPException(status_code=400, detail="Vehicle ID already exists")
    v = VehicleModel(
        vehicle_id=data.id, driver=data.driver, driver_mobile=data.driver_mobile,
        route=data.route, load=data.load, schedule_time=data.schedule_time,
        status=data.status, progress_pct=0,
    )
    db.add(v)
    await db.commit()
    await db.refresh(v)
    return v_dict(v)

@router.patch("/{vehicle_id}")
async def update_vehicle(vehicle_id: str, data: VehicleUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(VehicleModel).where(VehicleModel.vehicle_id == vehicle_id))
    v = result.scalars().first()
    if not v:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    for field, val in data.model_dump(exclude_none=True).items():
        setattr(v, field, val)
    await db.commit()
    await db.refresh(v)
    return v_dict(v)

@router.post("/{vehicle_id}/cancel")
async def cancel_vehicle(vehicle_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(VehicleModel).where(VehicleModel.vehicle_id == vehicle_id))
    v = result.scalars().first()
    if not v:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    v.status = "standby"
    v.progress_pct = 0
    v.schedule_time = ""
    v.route = ""
    v.load = ""
    await db.commit()
    await db.refresh(v)
    return v_dict(v)

@router.post("/auto-schedule")
async def auto_schedule(db: AsyncSession = Depends(get_db)):
    """Offline AI auto-assigns standby vehicles using route training data."""
    result = await db.execute(select(VehicleModel).where(VehicleModel.status == "standby"))
    standby = result.scalars().all()
    assigned = 0
    route_plans = load_route_plans()
    assignments = []

    for i, v in enumerate(standby):
        if i < len(route_plans):
            plan = route_plans[i]
            v.route = plan.route
            v.load = plan.load
            v.status = "enroute"
            v.progress_pct = 0
            assignments.append(
                {
                    "vehicle": v.vehicle_id,
                    "driver": v.driver,
                    "plan": route_plan_to_message(plan),
                }
            )
            assigned += 1
    await db.commit()
    return {
        "message": f"AI auto-scheduled {assigned} vehicles",
        "assigned": assigned,
        "assignments": assignments,
    }

@router.delete("/{vehicle_id}")
async def delete_vehicle(vehicle_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(VehicleModel).where(VehicleModel.vehicle_id == vehicle_id))
    v = result.scalars().first()
    if not v:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    await db.delete(v)
    await db.commit()
    return {"message": "Deleted"}
