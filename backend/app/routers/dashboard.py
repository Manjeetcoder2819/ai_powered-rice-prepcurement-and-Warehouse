    # ── DASHBOARD ROUTER ──────────────────────────────────────────
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.core.database import get_db
from app.models.farmer import FarmerModel
from app.models.bags import BatchModel
from app.models.warehouse import StockModel
from app.models.sms_log import SMSLogModel
from app.services.prediction import training_summary

router = APIRouter()

@router.get("/kpis")
async def get_kpis(db: AsyncSession = Depends(get_db)):
    farmers_q = await db.execute(select(func.count()).where(FarmerModel.status.in_(["waiting","processing"])))
    done_q    = await db.execute(select(func.count()).where(FarmerModel.status == "done"))
    bags_q    = await db.execute(select(func.sum(BatchModel.total_bags)))
    dmg_q     = await db.execute(select(func.sum(BatchModel.damaged)))
    stock_q   = await db.execute(select(func.sum(StockModel.qty_mt)))
    cap_q     = await db.execute(select(func.sum(StockModel.capacity_mt)))
    sms_q     = await db.execute(select(func.count(SMSLogModel.id)))

    in_queue  = farmers_q.scalar() or 24
    total_bags= int(bags_q.scalar() or 2543)
    damaged   = int(dmg_q.scalar() or 37)
    stock     = float(stock_q.scalar() or 1245.80)
    capacity  = float(cap_q.scalar() or 2000.0)
    pct       = round((stock / capacity * 100) if capacity > 0 else 0)

    return {
        "farmers_in_queue":      in_queue,
        "farmers_delta":         -8,
        "rice_procured_mt":      128.45,
        "rice_delta_pct":        12.5,
        "bags_counted":          total_bags,
        "bags_today":            156,
        "damaged_bags":          damaged,
        "damaged_pct":           round(damaged / total_bags * 100, 2) if total_bags > 0 else 1.45,
        "warehouse_stock_mt":    stock,
        "warehouse_capacity_mt": capacity,
        "warehouse_pct":         pct,
        "alerts_today":          12,
    }

@router.get("/alerts")
async def get_alerts():
    return [
        {"id":1,"type":"rainfall","title":"Rainfall Alert",   "description":"Heavy rainfall predicted in 2 hours",             "time":"10:20 AM","severity":"warning"},
        {"id":2,"type":"sms",     "title":"SMS Sent",         "description":"Procurement schedule SMS sent to 45 farmers",     "time":"10:15 AM","severity":"info"},
        {"id":3,"type":"damage",  "title":"Damaged Bags",     "description":"37 damaged bags detected in Batch #B245",         "time":"10:10 AM","severity":"error"},
        {"id":4,"type":"vehicle", "title":"Vehicle Scheduled","description":"Vehicle UP32AB1234 scheduled for 2:00 PM",        "time":"10:05 AM","severity":"info"},
        {"id":5,"type":"stock",   "title":"Stock Updated",    "description":"Warehouse stock updated: 128.45 MT added",        "time":"10:00 AM","severity":"info"},
    ]


@router.get("/model-training")
async def get_model_training(db: AsyncSession = Depends(get_db)):
    return await training_summary(db)


@router.post("/retrain")
async def retrain_models(db: AsyncSession = Depends(get_db)):
    from app.services.prediction import train_queue_wait_model, train_weather_model
    train_queue_wait_model()
    train_weather_model()
    return await training_summary(db)


# ── DATASET MANAGEMENT ENDPOINTS ──────────────────────────────────
from pydantic import BaseModel
from fastapi import HTTPException, UploadFile, File
import csv
import io

class DatasetRecordCreate(BaseModel):
    variety: str
    total_bags: int
    damaged: int
    wet: int
    moisture_pct: float | None = None
    humidity_pct: float | None = 70.0
    rain_risk_pct: float | None = 40.0

@router.get("/dataset")
async def get_dataset():
    from app.services.prediction import QUALITY_DATASET
    if not QUALITY_DATASET.exists():
        return []
    records = []
    try:
        with open(QUALITY_DATASET, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                records.append({
                    "variety": row.get("variety", ""),
                    "total_bags": int(row.get("total_bags") or 0),
                    "damaged": int(row.get("damaged") or 0),
                    "wet": int(row.get("wet") or 0),
                    "moisture_pct": float(row.get("moisture_pct") or 12.5),
                    "humidity_pct": float(row.get("humidity_pct") or 70.0),
                    "rain_risk_pct": float(row.get("rain_risk_pct") or 40.0),
                    "source": row.get("source", "dataset")
                })
    except Exception as e:
        print(f"Error reading dataset: {e}")
    # Return the last 200 records to keep it fast, newest first
    return records[::-1][:200]

@router.post("/dataset")
async def add_dataset_record(data: DatasetRecordCreate):
    from app.services.prediction import QUALITY_DATASET, upload_dataset_to_supabase, DATASET_DIR
    try:
        DATASET_DIR.mkdir(parents=True, exist_ok=True)
        file_exists = QUALITY_DATASET.exists()
        moisture = data.moisture_pct
        if moisture is None:
            moisture = round(12.5 + (data.wet / data.total_bags * 10.0) if data.total_bags > 0 else 12.5, 1)
        
        with open(QUALITY_DATASET, "a", encoding="utf-8", newline="") as csv_file:
            writer = csv.writer(csv_file)
            if not file_exists:
                writer.writerow(["variety", "total_bags", "damaged", "wet", "moisture_pct", "humidity_pct", "rain_risk_pct", "source"])
            writer.writerow([
                data.variety,
                data.total_bags,
                data.damaged,
                data.wet,
                moisture,
                data.humidity_pct or 70.0,
                data.rain_risk_pct or 40.0,
                "manual_entry"
            ])
        await upload_dataset_to_supabase()
        return {"status": "success", "message": "Record added successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/dataset/upload")
async def upload_dataset(file: UploadFile = File(...)):
    from app.services.prediction import QUALITY_DATASET, upload_dataset_to_supabase
    try:
        content = await file.read()
        text = content.decode("utf-8")
        reader = csv.reader(io.StringIO(text))
        header = next(reader)
        expected_cols = ["variety", "total_bags", "damaged", "wet"]
        if not all(col in header for col in expected_cols):
            raise HTTPException(
                status_code=400,
                detail=f"CSV must contain at least headers: {', '.join(expected_cols)}"
            )
        
        with open(QUALITY_DATASET, "wb") as f:
            f.write(content)
            
        await upload_dataset_to_supabase()
        return {"status": "success", "message": "Dataset CSV uploaded successfully"}
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))


