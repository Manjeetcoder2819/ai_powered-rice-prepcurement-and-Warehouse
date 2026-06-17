### app/routers/bags.py
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime
from app.core.database import get_db
from app.models.bags import BatchModel
from app.models.farmer import FarmerModel
from app.services.prediction import predict_batch_scan

router = APIRouter()

def batch_to_dict(b: BatchModel) -> dict:
    return {
        "id": b.batch_id,
        "farmer_name": b.farmer_name, "farmer_mobile": b.farmer_mobile,
        "variety": b.variety,
        "total_bags": b.total_bags, "good": b.good,
        "damaged": b.damaged, "wet": b.wet,
        "damaged_indices": [int(x) for x in b.damaged_indices.split(",") if x],
        "wet_indices":     [int(x) for x in b.wet_indices.split(",") if x],
        "deduction_amount": b.deduction_amount,
        "scanned_at": b.scanned_at,
        "status": getattr(b, "status", "Pending"),
    }

@router.get("/batches")
async def get_batches(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(BatchModel).order_by(BatchModel.id.desc()))
    return [batch_to_dict(b) for b in result.scalars().all()]

@router.post("/scan/{farmer_id}")
async def scan_batch(farmer_id: int, db: AsyncSession = Depends(get_db)):
    """Simulate AI scanning — in production integrate with CV model."""
    farmer_r = await db.execute(select(FarmerModel).where(FarmerModel.id == farmer_id))
    farmer = farmer_r.scalars().first()
    if not farmer:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Farmer not found")

    prediction, damaged_idx, wet_idx = await predict_batch_scan(db, farmer)
    total = farmer.bags
    dmg_count = prediction.expected_damaged
    wet_count = prediction.expected_wet
    good = prediction.expected_good

    count_r = await db.execute(select(BatchModel))
    batch_num = len(count_r.scalars().all()) + 1
    batch_id  = f"B-{batch_num:04d}"

    batch = BatchModel(
        batch_id=batch_id,
        farmer_name=farmer.name,
        farmer_mobile=farmer.mobile,
        variety=farmer.variety,
        total_bags=total,
        good=good,
        damaged=dmg_count,
        wet=wet_count,
        damaged_indices=",".join(map(str, damaged_idx)),
        wet_indices=",".join(map(str, wet_idx)),
        deduction_amount=prediction.estimated_deduction,
        scanned_at=datetime.now().strftime("%I:%M %p"),
    )
    db.add(batch)
    if dmg_count > 0 or wet_count > 0:
        farmer.status = "alert"
    else:
        farmer.status = "done"

    # Append to local CSV quality training dataset and sync to Supabase Storage
    from app.services.prediction import append_quality_record
    await append_quality_record(
        variety=farmer.variety,
        total_bags=total,
        damaged=dmg_count,
        wet=wet_count
    )

    await db.commit()
    await db.refresh(batch)

    # Automated Quality Alert / Confirmation Email
    if farmer.email:
        try:
            from app.routers.email import dispatch_email, save_email
            if farmer.status == "alert":
                subject = f"AI Quality Scan Alert: Batch {batch_id}"
                message = (
                    f"Dear {farmer.name},\n\n"
                    f"The automated AI scan for your batch {batch_id} has completed with alerts:\n"
                    f"Total Bags: {total}\n"
                    f"Good Bags: {good}\n"
                    f"Damaged Bags: {dmg_count}\n"
                    f"Wet Bags: {wet_count}\n"
                    f"Estimated Deduction Amount: ₹{prediction.estimated_deduction}\n\n"
                    f"Please report to the Quality Control bay to review your scan details.\n\n"
                    f"Regards,\n"
                    f"Pimpri APMC Warehouse Management"
                )
                email_type = "damage_alert"
            else: # "done"
                subject = f"Procurement Completed - Token {farmer.token}"
                message = (
                    f"Dear {farmer.name},\n\n"
                    f"The automated AI scan for your batch {batch_id} has completed successfully with no defects detected!\n"
                    f"Total bags accepted: {total}.\n"
                    f"Please proceed to Counter 1 to collect your invoice and payment receipt.\n\n"
                    f"Regards,\n"
                    f"Pimpri APMC Warehouse Management"
                )
                email_type = "complete"
                
            ok = await dispatch_email(farmer.email, subject, message)
            await save_email(db, email_type, farmer.name, farmer.email, subject, message, "delivered" if ok else "failed")
        except Exception as e:
            print(f"Failed to dispatch automated scan email: {e}")

    return batch_to_dict(batch)


from pydantic import BaseModel

class BatchStatusUpdate(BaseModel):
    status: str

@router.patch("/batches/{batch_id}/status")
async def update_batch_status(batch_id: str, data: BatchStatusUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(BatchModel).where(BatchModel.batch_id == batch_id))
    batch = result.scalars().first()
    if not batch:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Batch not found")
        
    old_status = getattr(batch, "status", "Pending")
    new_status = data.status
    batch.status = new_status
    
    # If the status changes to Approved, integrate with Warehouse:
    if new_status == "Approved" and old_status != "Approved":
        # 1 bag = 50kg = 0.05 Metric Tons
        qty_mt = batch.good * 0.05
        
        # Add Ledger inflow
        from app.models.warehouse import LedgerModel, StockModel
        now_time = datetime.now().strftime("%H:%M")
        
        # Query variety stock to determine zone
        stock_r = await db.execute(select(StockModel).where(StockModel.variety == batch.variety))
        stock = stock_r.scalars().first()
        target_zone = stock.zone if stock else "A"
        
        ledger_entry = LedgerModel(
            time=now_time,
            variety=batch.variety or "Sona Masoori",
            qty_mt=qty_mt,
            zone=target_zone,
            type="Inflow",
            operator="AI System (Procurement)"
        )
        db.add(ledger_entry)
        
        # Update stock for variety
        if stock:
            stock.qty_mt = round(stock.qty_mt + qty_mt, 2)
            
    await db.commit()
    await db.refresh(batch)
    return batch_to_dict(batch)
