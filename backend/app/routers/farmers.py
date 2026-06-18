from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from datetime import datetime
from types import SimpleNamespace
from app.core.database import get_db
from app.models.farmer import FarmerModel
from app.services.prediction import predict_farmer_quality, predict_wait_minutes

router = APIRouter()

class FarmerCreate(BaseModel):
    name: str
    mobile: str
    village: str = ""
    aadhaar_last4: str = ""
    variety: str
    bags: int
    notes: str = ""
    email: str = ""

class FarmerStatusUpdate(BaseModel):
    status: str


class FarmerPredictionRequest(BaseModel):
    variety: str
    bags: int
    queue_position: int = 1


async def farmer_to_dict(f: FarmerModel, db: AsyncSession | None = None) -> dict:
    data = {
        "id": f.id, "token": f.token, "name": f.name, "mobile": f.mobile,
        "village": f.village, "aadhaar_last4": f.aadhaar_last4,
        "variety": f.variety, "bags": f.bags, "status": f.status,
        "wait_minutes": f.wait_minutes, "arrived_at": f.arrived_at,
        "notes": f.notes or "",
        "email": f.email or "",
    }
    if db is not None:
        prediction = await predict_farmer_quality(db, f)
        data["prediction"] = prediction.__dict__
    return data

@router.get("")
async def get_farmers(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(FarmerModel).order_by(FarmerModel.id.desc()))
    return [await farmer_to_dict(f, db) for f in result.scalars().all()]

@router.post("")
async def create_farmer(data: FarmerCreate, db: AsyncSession = Depends(get_db)):
    if data.bags <= 0:
        raise HTTPException(status_code=400, detail="Bags count must be a positive integer (at least 1 bag)")
    
    # Generate token
    result = await db.execute(select(FarmerModel))
    count  = len(result.scalars().all())
    token  = f"F{(count + 24):03d}"
    waiting = await db.execute(
        select(FarmerModel).where(FarmerModel.status.in_(["waiting", "processing"]))
    )
    wait_count = len(waiting.scalars().all())
    now = datetime.now()
    arrived = now.strftime("%I:%M %p")
    farmer = FarmerModel(
        token=token, name=data.name, mobile=data.mobile,
        village=data.village, aadhaar_last4=data.aadhaar_last4,
        variety=data.variety, bags=data.bags, notes=data.notes,
        status="waiting", wait_minutes=predict_wait_minutes(wait_count + 1, data.bags),
        arrived_at=arrived, email=data.email,
    )
    db.add(farmer)
    await db.commit()
    await db.refresh(farmer)

    # Automated Email Alert
    if data.email:
        try:
            from app.routers.email import dispatch_email, save_email
            subject = f"Rice Procurement Queue Token: {token}"
            message = (
                f"Dear {data.name},\n\n"
                f"Your token {token} has been successfully registered for rice procurement.\n"
                f"Variety: {data.variety}\n"
                f"Bags: {data.bags}\n"
                f"Estimated Wait Time: {farmer.wait_minutes} minutes.\n\n"
                f"Please report to the unloading bay when called.\n\n"
                f"Regards,\n"
                f"Pimpri APMC Warehouse Management"
            )
            ok = await dispatch_email(data.email, subject, message)
            await save_email(db, "queue", data.name, data.email, subject, message, "delivered" if ok else "failed")
        except Exception as e:
            print(f"Failed to dispatch automated email on farmer registration: {e}")

    return await farmer_to_dict(farmer, db)


@router.post("/predict")
async def predict_farmer(data: FarmerPredictionRequest, db: AsyncSession = Depends(get_db)):
    farmer = SimpleNamespace(
        token="PREVIEW",
        name="Preview Farmer",
        mobile="",
        variety=data.variety,
        bags=max(data.bags, 0),
    )
    prediction = await predict_farmer_quality(db, farmer)
    return {
        "wait_minutes": predict_wait_minutes(data.queue_position, data.bags),
        "prediction": prediction.__dict__,
    }

@router.patch("/{farmer_id}/status")
async def update_status(farmer_id: int, data: FarmerStatusUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(FarmerModel).where(FarmerModel.id == farmer_id))
    farmer = result.scalars().first()
    if not farmer:
        raise HTTPException(status_code=404, detail="Farmer not found")
    farmer.status = data.status
    if data.status == "processing":
        farmer.wait_minutes = 0
    await db.commit()
    await db.refresh(farmer)

    # Automated Email Alert on Status Update
    if farmer.email:
        try:
            from app.routers.email import dispatch_email, save_email
            if data.status == "processing":
                subject = f"Procurement Processing Started - Token {farmer.token}"
                message = (
                    f"Dear {farmer.name},\n\n"
                    f"Your token {farmer.token} is now being processed at the unloading counter.\n"
                    f"Please proceed with your vehicle to Bay 2.\n\n"
                    f"Regards,\n"
                    f"Pimpri APMC Warehouse Management"
                )
            elif data.status == "done":
                subject = f"Procurement Completed - Token {farmer.token}"
                message = (
                    f"Dear {farmer.name},\n\n"
                    f"Procurement for your token {farmer.token} is complete.\n"
                    f"Total bags accepted: {farmer.bags}.\n"
                    f"Please collect your invoice and payment receipt at Counter 1.\n\n"
                    f"Regards,\n"
                    f"Pimpri APMC Warehouse Management"
                )
            else:
                subject = f"Status Update - Token {farmer.token}"
                message = (
                    f"Dear {farmer.name},\n\n"
                    f"The status of your token {farmer.token} has been updated to: {data.status}.\n\n"
                    f"Regards,\n"
                    f"Pimpri APMC Warehouse Management"
                )
            ok = await dispatch_email(farmer.email, subject, message)
            await save_email(db, data.status, farmer.name, farmer.email, subject, message, "delivered" if ok else "failed")
        except Exception as e:
            print(f"Failed to dispatch automated status update email: {e}")

    return await farmer_to_dict(farmer, db)

@router.delete("/{farmer_id}")
async def delete_farmer(farmer_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(FarmerModel).where(FarmerModel.id == farmer_id))
    farmer = result.scalars().first()
    if not farmer:
        raise HTTPException(status_code=404, detail="Farmer not found")
    await db.delete(farmer)
    await db.commit()
    return {"message": "Deleted"}
