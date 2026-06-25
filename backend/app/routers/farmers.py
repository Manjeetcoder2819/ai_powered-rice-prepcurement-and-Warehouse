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
    bags: int = 0
    notes: str = ""
    email: str = ""
    cultivated_area: float
    harvest_date: str
    slot_date: str = ""
    slot_time: str = ""

class FarmerStatusUpdate(BaseModel):
    status: str


class FarmerPredictionRequest(BaseModel):
    variety: str
    bags: int = 0
    cultivated_area: float = 0.0
    queue_position: int = 1


async def farmer_to_dict(f: FarmerModel, db: AsyncSession | None = None) -> dict:
    data = {
        "id": f.id, "token": f.token, "name": f.name, "mobile": f.mobile,
        "village": f.village, "aadhaar_last4": f.aadhaar_last4,
        "variety": f.variety, "bags": f.bags, "status": f.status,
        "wait_minutes": f.wait_minutes, "arrived_at": f.arrived_at,
        "notes": f.notes or "",
        "email": f.email or "",
        "cultivated_area": f.cultivated_area,
        "harvest_date": f.harvest_date,
        "predicted_yield_kg": f.predicted_yield_kg,
        "recommended_vehicle": f.recommended_vehicle,
        "slot_date": f.slot_date or f.harvest_date,
        "slot_time": f.slot_time,
        "assigned_vehicle": f.assigned_vehicle or "",
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
    if data.cultivated_area <= 0:
        raise HTTPException(status_code=400, detail="Cultivated area must be a positive number (greater than 0)")
    
    # Calculate predicted yield and estimated bags
    predicted_yield_kg = data.cultivated_area * 2000.0  # 2 tons per acre = 2000 Kg
    calculated_bags = int(predicted_yield_kg / 50.0)    # 1 bag = 50 Kg
    bags = data.bags if data.bags > 0 else calculated_bags

    # Determine recommended vehicle
    if predicted_yield_kg <= 5000.0:
        recommended_vehicle = "Mini truck"
    elif predicted_yield_kg <= 12000.0:
        recommended_vehicle = "Medium truck"
    else:
        recommended_vehicle = "Large truck"

    # Check duplicate booking on the same harvest date
    duplicate = await db.execute(
        select(FarmerModel).where(
            (FarmerModel.name == data.name) | (FarmerModel.mobile == data.mobile),
            FarmerModel.harvest_date == data.harvest_date
        )
    )
    if duplicate.scalars().first():
        raise HTTPException(
            status_code=400,
            detail=f"Duplicate booking: A booking with the same name or mobile already exists for harvest date {data.harvest_date}."
        )

    # Check daily procurement capacity (20,000 Kg limit)
    result_yield = await db.execute(
        select(FarmerModel).where(FarmerModel.harvest_date == data.harvest_date)
    )
    total_day_yield = sum(f.predicted_yield_kg for f in result_yield.scalars().all())
    if total_day_yield + predicted_yield_kg > 20000.0:
        raise HTTPException(
            status_code=400,
            detail=f"Daily capacity warning: Daily procurement capacity limit (20,000 Kg) exceeded for {data.harvest_date}. Currently booked: {total_day_yield} Kg. Attempting to add: {predicted_yield_kg} Kg."
        )

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
        variety=data.variety, bags=bags, notes=data.notes,
        status="waiting", wait_minutes=predict_wait_minutes(wait_count + 1, bags),
        arrived_at=arrived, email=data.email,
        cultivated_area=data.cultivated_area,
        harvest_date=data.harvest_date,
        predicted_yield_kg=predicted_yield_kg,
        recommended_vehicle=recommended_vehicle,
        slot_date=data.slot_date or data.harvest_date,
        slot_time=data.slot_time,
        assigned_vehicle="",
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
                f"Cultivated Area: {data.cultivated_area} acres\n"
                f"Predicted Yield: {predicted_yield_kg} Kg\n"
                f"Estimated Bags: {bags}\n"
                f"Slot Date/Time: {farmer.slot_date} at {farmer.slot_time}\n"
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
    cultivated_area = data.cultivated_area
    if cultivated_area <= 0 and data.bags > 0:
        cultivated_area = (data.bags * 50.0) / 2000.0

    predicted_yield_kg = cultivated_area * 2000.0
    bags = data.bags if data.bags > 0 else int(predicted_yield_kg / 50.0)

    if predicted_yield_kg <= 5000.0:
        recommended_vehicle = "Mini truck"
    elif predicted_yield_kg <= 12000.0:
        recommended_vehicle = "Medium truck"
    else:
        recommended_vehicle = "Large truck"

    farmer = SimpleNamespace(
        token="PREVIEW",
        name="Preview Farmer",
        mobile="",
        variety=data.variety,
        bags=max(bags, 1),
    )
    prediction = await predict_farmer_quality(db, farmer)
    return {
        "wait_minutes": predict_wait_minutes(data.queue_position, bags),
        "predicted_yield_kg": predicted_yield_kg,
        "bags": bags,
        "recommended_vehicle": recommended_vehicle,
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
