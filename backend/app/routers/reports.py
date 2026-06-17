from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime
import csv, io
from app.core.database import get_db
from app.models.farmer import FarmerModel
from app.models.bags import BatchModel
from app.models.warehouse import StockModel, LedgerModel
from app.models.vehicle import VehicleModel
from app.models.sms_log import SMSLogModel

router = APIRouter()

def csv_response(rows: list[list], headers: list[str], filename: str) -> StreamingResponse:
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(headers)
    writer.writerows(rows)
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )

@router.get("/daily/download")
async def download_daily(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(FarmerModel).order_by(FarmerModel.id))
    farmers = result.scalars().all()
    rows = [[f.token, f.name, f.mobile, f.village, f.variety, f.bags,
             f.status, f.arrived_at, f.wait_minutes, f.notes or ""]
            for f in farmers]
    return csv_response(
        rows,
        ["Token","Name","Mobile","Village","Variety","Bags","Status","Arrived","Wait(min)","Notes"],
        f"daily_report_{datetime.now().strftime('%Y%m%d')}.csv"
    )

@router.get("/warehouse/download")
async def download_warehouse(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(StockModel))
    stock  = result.scalars().all()
    rows   = [[s.variety, s.qty_mt, s.capacity_mt, s.zone,
               round(s.qty_mt / s.capacity_mt * 100, 1) if s.capacity_mt else 0]
              for s in stock]
    return csv_response(
        rows,
        ["Variety","Qty(MT)","Capacity(MT)","Zone","Utilisation(%)"],
        f"warehouse_report_{datetime.now().strftime('%Y%m%d')}.csv"
    )

@router.get("/damage/download")
async def download_damage(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(BatchModel).order_by(BatchModel.id.desc()))
    batches = result.scalars().all()
    rows = [[b.batch_id, b.farmer_name, b.farmer_mobile, b.total_bags,
             b.good, b.damaged, b.wet, b.deduction_amount, b.scanned_at]
            for b in batches]
    return csv_response(
        rows,
        ["BatchID","Farmer","Mobile","Total","Good","Damaged","Wet","Deduction(₹)","ScannedAt"],
        f"damage_report_{datetime.now().strftime('%Y%m%d')}.csv"
    )

@router.get("/vehicle/download")
async def download_vehicle(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(VehicleModel).order_by(VehicleModel.id))
    vehicles = result.scalars().all()
    rows = [[v.vehicle_id, v.driver, v.driver_mobile, v.route, v.load,
             v.status, v.progress_pct, v.schedule_time or ""]
            for v in vehicles]
    return csv_response(
        rows,
        ["VehicleID","Driver","Mobile","Route","Load","Status","Progress(%)","ScheduleTime"],
        f"vehicle_report_{datetime.now().strftime('%Y%m%d')}.csv"
    )

@router.get("/sms/download")
async def download_sms(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SMSLogModel).order_by(SMSLogModel.id.desc()))
    logs = result.scalars().all()
    rows = [[l.sent_at, l.recipient, l.mobile, l.type, l.message, l.status]
            for l in logs]
    return csv_response(
        rows,
        ["SentAt","Recipient","Mobile","Type","Message","Status"],
        f"sms_log_{datetime.now().strftime('%Y%m%d')}.csv"
    )

@router.get("/weather/download")
async def download_weather():
    rows = [
        [datetime.now().strftime("%Y-%m-%d"), "Pimpri", "29°C", "68%", "Yes", "Yard C covered"],
    ]
    return csv_response(
        rows,
        ["Date","Location","Temp","RainRisk","AlertSent","Action"],
        f"weather_log_{datetime.now().strftime('%Y%m%d')}.csv"
    )

@router.get("/weekly-summary")
async def weekly_summary():
    return [
        {"day": "Mon", "bags": 3200, "farmers": 98,  "damaged": 45},
        {"day": "Tue", "bags": 4100, "farmers": 121, "damaged": 62},
        {"day": "Wed", "bags": 4650, "farmers": 135, "damaged": 38},
        {"day": "Thu", "bags": 3800, "farmers": 108, "damaged": 55},
        {"day": "Fri", "bags": 4820, "farmers": 142, "damaged": 37},
        {"day": "Sat", "bags": 2900, "farmers": 87,  "damaged": 28},
        {"day": "Sun", "bags": 0,    "farmers": 0,   "damaged": 0 },
    ]
