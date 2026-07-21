from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from app.core.database import get_db
from app.models.vehicle import VehicleModel
from app.models.farmer import FarmerModel
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
        "last_gate_image_url": v.last_gate_image_url or "",
        "last_plate_detected": v.last_plate_detected or "",
        "last_anpr_confidence": v.last_anpr_confidence or 0.0,
        "last_gate_decision": v.last_gate_decision or "",
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

def get_vehicle_capacity(vehicle_id: str) -> float:
    v_id = vehicle_id.upper()
    if "MINI" in v_id or "5T" in v_id:
        return 5000.0
    elif "MEDIUM" in v_id or "12T" in v_id:
        return 12000.0
    elif "LARGE" in v_id or "20T" in v_id:
        return 20000.0
    
    # Defaults/Fallback for seeded vehicles or custom ones
    if v_id == "MH12EF3344":  # Seeded offline
        return 5000.0
    if v_id in ["MH12AB4521", "MH14CD9087"]:
        return 12000.0
    
    # General fallback: check last digit
    try:
        last_digit = int(v_id[-1])
        if last_digit % 3 == 0:
            return 20000.0 # Large
        elif last_digit % 2 == 0:
            return 5000.0  # Mini
        else:
            return 12000.0 # Medium
    except:
        return 12000.0

class GateVerifyRequest(BaseModel):
    vehicle_id: str
    override: Optional[bool] = False
    confidence: Optional[float] = 1.0

@router.post("/{vehicle_id}/assign/{farmer_id}")
async def assign_vehicle(vehicle_id: str, farmer_id: int, db: AsyncSession = Depends(get_db)):
    # 1. Fetch vehicle
    v_res = await db.execute(select(VehicleModel).where(VehicleModel.vehicle_id == vehicle_id))
    vehicle = v_res.scalars().first()
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    
    if vehicle.status == "offline":
        raise HTTPException(status_code=400, detail="Cannot assign: Vehicle is offline")
        
    # 2. Fetch farmer
    f_res = await db.execute(select(FarmerModel).where(FarmerModel.id == farmer_id))
    farmer = f_res.scalars().first()
    if not farmer:
        raise HTTPException(status_code=404, detail="Farmer not found")
        
    # 3. Capacity Check
    capacity = get_vehicle_capacity(vehicle.vehicle_id)
    if farmer.predicted_yield_kg > capacity:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot assign: Farmer's predicted yield ({farmer.predicted_yield_kg} Kg) exceeds vehicle capacity ({capacity} Kg)"
        )
        
    # 4. Perform mapping
    farmer.assigned_vehicle = vehicle.vehicle_id
    vehicle.status = "enroute"
    vehicle.load = f"{farmer.bags} bags {farmer.variety}"
    vehicle.schedule_time = farmer.slot_time or "12:00 PM"
    vehicle.route = f"{farmer.village or 'Sanaswadi'} to APMC Pimpri"
    
    # 5. Log SMS notification
    try:
        from app.routers.sms import dispatch_sms, save_sms
        msg = f"Dear {farmer.name}, vehicle {vehicle.vehicle_id} has been assigned to your booking. Slot: {farmer.slot_time}. - APMC"
        ok = await dispatch_sms(farmer.mobile, msg)
        await save_sms(db, "queue", farmer.name, farmer.mobile, msg, "delivered" if ok else "failed")
    except Exception as e:
        print(f"Failed to send assignment SMS: {e}")
        
    await db.commit()
    await db.refresh(farmer)
    await db.refresh(vehicle)
    
    from app.routers.farmers import farmer_to_dict
    return {
        "farmer": await farmer_to_dict(farmer, db),
        "vehicle": v_dict(vehicle)
    }

@router.post("/gate-verify-workflow")
async def gate_verify_workflow(data: GateVerifyRequest, db: AsyncSession = Depends(get_db)):
    """
    Booking-workflow gate check driven by a manually supplied/simulated plate
    read (vehicle_id + confidence + override). Transitions the matched
    booking to 'processing' and the vehicle to 'arrived' on success.
    For the real OpenCV/Tesseract photo-based ANPR check, see the multipart
    POST /gate-verify endpoint below.
    """
    # 1. Fetch vehicle
    v_res = await db.execute(select(VehicleModel).where(VehicleModel.vehicle_id == data.vehicle_id))
    vehicle = v_res.scalars().first()
    if not vehicle:
        return {
            "status": "denied",
            "reason": f"Vehicle '{data.vehicle_id}' not found in registered database."
        }
        
    # 2. Fetch associated farmer booking
    f_res = await db.execute(
        select(FarmerModel).where(
            FarmerModel.assigned_vehicle == data.vehicle_id,
            FarmerModel.status == "waiting"
        )
    )
    farmer = f_res.scalars().first()
    
    if not farmer:
        # Fallback check: see if a booking exists that is already in processing/done status
        f_res_alt = await db.execute(
            select(FarmerModel).where(
                FarmerModel.assigned_vehicle == data.vehicle_id,
                FarmerModel.status.in_(["processing", "done"])
            )
        )
        farmer_alt = f_res_alt.scalars().first()
        if farmer_alt:
            from app.routers.farmers import farmer_to_dict
            return {
                "status": "allowed",
                "reason": f"Vehicle '{data.vehicle_id}' is already verified. Associated farmer '{farmer_alt.name}' is currently in processing/completed status.",
                "farmer": await farmer_to_dict(farmer_alt, db),
                "vehicle": v_dict(vehicle)
            }
            
        return {
            "status": "denied",
            "reason": f"No active/waiting booking found for vehicle {data.vehicle_id}."
        }
        
    from app.routers.farmers import farmer_to_dict
    farmer_data = await farmer_to_dict(farmer, db)
    vehicle_data = v_dict(vehicle)

    # 3. Simulate OCR Confidence Check
    if data.confidence < 0.75 and not data.override:
        return {
            "status": "manual_verification",
            "reason": f"Low plate read confidence ({round(data.confidence * 100)}%). Requires manual operator check.",
            "farmer": farmer_data,
            "vehicle": vehicle_data
        }
        
    # 4. Check Slot Date
    # Simulating a mismatch if the booking slot date isn't today (e.g. "2026-06-25")
    today_str = datetime.now().strftime("%Y-%m-%d")
    # For testing/demo, we can default to "2026-06-25"
    if farmer.slot_date and farmer.slot_date != "2026-06-25" and not data.override:
        return {
            "status": "wrong_slot",
            "reason": f"Wrong slot date: Booking scheduled for {farmer.slot_date}, but arrival is on 2026-06-25.",
            "farmer": farmer_data,
            "vehicle": vehicle_data
        }
        
    # 5. Success Flow: Transition status
    farmer.status = "processing"
    vehicle.status = "arrived"
    vehicle.progress_pct = 100
    
    # Send Gate Success SMS
    try:
        from app.routers.sms import dispatch_sms, save_sms
        msg = f"Dear {farmer.name}, your vehicle {vehicle.vehicle_id} has entered the gate. Processing started. - APMC"
        ok = await dispatch_sms(farmer.mobile, msg)
        await save_sms(db, "queue", farmer.name, farmer.mobile, msg, "delivered" if ok else "failed")
    except Exception as e:
        print(f"Failed to send gate verify SMS: {e}")
        
    await db.commit()
    await db.refresh(farmer)
    await db.refresh(vehicle)
    
    return {
        "status": "allowed",
        "reason": "Plate verification successful. Proceed to Bay 2.",
        "farmer": await farmer_to_dict(farmer, db),
        "vehicle": v_dict(vehicle)
    }

@router.post("/reset-simulator")
async def reset_simulator(db: AsyncSession = Depends(get_db)):
    # Reset Ramesh Yadav to waiting and link back to MH14CD9087
    await db.execute(
        update(FarmerModel)
        .where(FarmerModel.token == "F024")
        .values(status="waiting", assigned_vehicle="MH14CD9087")
    )
    
    # Reset Sita Devi to waiting and link back to MH12AB4521
    await db.execute(
        update(FarmerModel)
        .where(FarmerModel.token == "F025")
        .values(status="waiting", assigned_vehicle="MH12AB4521")
    )
    
    # Reset Vehicles
    await db.execute(
        update(VehicleModel)
        .where(VehicleModel.vehicle_id == "MH14CD9087")
        .values(status="standby", route="", load="", progress_pct=0)
    )
    
    await db.execute(
        update(VehicleModel)
        .where(VehicleModel.vehicle_id == "MH12AB4521")
        .values(status="enroute", route="Sanaswadi to APMC Pimpri", load="150 bags SM", progress_pct=40)
    )
    
    await db.commit()
    return {"message": "Simulator database state successfully reset! Ramesh Yadav and Sita Devi are back in 'waiting' state."}


# =========================================================
# ANPR GATE VERIFICATION — real OCR-based plate check
# =========================================================

from fastapi import UploadFile, File, Form, Request
from app.services import vision
from app.services.storage import save_upload
from app.models.gate_log import GateLogModel


@router.post("/gate-verify")
async def gate_verify(
    request: Request,
    image: Optional[UploadFile] = File(None, description="Photo of the vehicle/number-plate at the gate"),
    expected_vehicle_id: Optional[str] = Form(None, description="Vehicle ID booked for this slot, if known"),
    booking_farmer_id: Optional[int] = Form(None),
    db: AsyncSession = Depends(get_db),
):
    """
    Runs real ANPR (OpenCV plate localisation + Tesseract OCR) on an uploaded
    gate photo and decides:
      - allowed        : detected plate matches a registered vehicle AND
                          (no expected_vehicle_id given, or it matches)
      - wrong_slot      : detected plate matches a registered vehicle, but a
                          DIFFERENT vehicle was expected for this slot
      - denied          : detected plate does not match any registered vehicle
      - manual_review   : OCR confidence too low to decide automatically
                          (blurred/dark/tilted plate)
    """
    if image is None:
        try:
            payload = await request.json()
        except Exception:
            raise HTTPException(status_code=400, detail="Upload an image file or send JSON vehicle_id/confidence.")
        return await gate_verify_workflow(GateVerifyRequest(**payload), db)

    img_bytes = await image.read()
    if not img_bytes:
        raise HTTPException(status_code=400, detail="Uploaded image is empty or corrupt.")

    is_video = (image.content_type or "").startswith("video") or (image.filename or "").lower().endswith(
        (".mp4", ".mov", ".avi", ".mkv")
    )

    try:
        if is_video:
            anpr = vision.read_number_plate_from_video(img_bytes)
        else:
            anpr = vision.read_number_plate(img_bytes)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Could not process gate media: {e}")

    upload_meta = await save_upload(
        "gate_images", image.filename or ("video.mp4" if is_video else "image.png"),
        img_bytes, image.content_type or ("video/mp4" if is_video else "image/png")
    )

    decision = "manual_review"
    matched_vehicle_id = ""
    is_registered = False
    vehicle_capacity = "Unregistered Vehicle (Capacity Unknown)"
    driver_name = ""
    assigned_farmer_name = ""

    if not anpr.manual_review_required and anpr.plate_text:
        all_vehicles = (await db.execute(select(VehicleModel))).scalars().all()
        registered_ids = [v.vehicle_id for v in all_vehicles]
        matched_id, match_score = vision.fuzzy_match_plate(anpr.plate_text, registered_ids)

        if matched_id:
            matched = next((v for v in all_vehicles if v.vehicle_id == matched_id), None)
            if matched:
                matched_vehicle_id = matched.vehicle_id
                is_registered = True
                driver_name = matched.driver or "Assigned APMC Driver"
                
                # Format capacity cleanly
                raw_load = (matched.load or "").strip()
                if "ton" in raw_load.lower():
                    vehicle_capacity = raw_load
                elif "bag" in raw_load.lower():
                    vehicle_capacity = f"10.0 Tons ({raw_load})"
                else:
                    vehicle_capacity = "10.0 Tons (10,000 Kg Capacity)"

                # Fetch assigned farmer
                f_res = await db.execute(
                    select(FarmerModel).where(FarmerModel.assigned_vehicle == matched_vehicle_id)
                )
                farmer_obj = f_res.scalars().first()
                if farmer_obj:
                    assigned_farmer_name = f"{farmer_obj.name} ({farmer_obj.token})"

                exp_norm = vision.normalize_plate(expected_vehicle_id) if expected_vehicle_id else ""
                match_norm = vision.normalize_plate(matched_vehicle_id)
                if exp_norm and exp_norm != match_norm:
                    decision = "wrong_slot"
                else:
                    decision = "allowed"

                matched.last_gate_image_url = upload_meta["url"]
                matched.last_plate_detected = anpr.plate_text
                matched.last_anpr_confidence = max(anpr.confidence, match_score)
                matched.last_gate_decision = decision
        else:
            decision = "denied"
            is_registered = False

    # Fallback lookup if expected_vehicle_id or booking_farmer_id was passed
    if not matched_vehicle_id and expected_vehicle_id:
        exp_veh = (await db.execute(select(VehicleModel).where(VehicleModel.vehicle_id == expected_vehicle_id.strip()))).scalars().first()
        if exp_veh:
            matched_vehicle_id = exp_veh.vehicle_id
            is_registered = True
            driver_name = exp_veh.driver or "Assigned APMC Driver"
            raw_load = (exp_veh.load or "").strip()
            if "ton" in raw_load.lower():
                vehicle_capacity = raw_load
            elif "bag" in raw_load.lower():
                vehicle_capacity = f"10.0 Tons ({raw_load})"
            else:
                vehicle_capacity = "10.0 Tons (10,000 Kg Capacity)"

            f_res = await db.execute(select(FarmerModel).where(FarmerModel.assigned_vehicle == expected_vehicle_id.strip()))
            farmer_obj = f_res.scalars().first()
            if farmer_obj:
                assigned_farmer_name = f"{farmer_obj.name} ({farmer_obj.token})"

    log = GateLogModel(
        image_url=upload_meta["url"],
        detected_plate=anpr.plate_text,
        matched_vehicle_id=matched_vehicle_id,
        confidence=anpr.confidence,
        decision=decision,
        booking_farmer_id=booking_farmer_id,
        notes=anpr.notes,
    )
    db.add(log)
    await db.commit()

    return {
        "decision": decision,
        "detected_plate": anpr.plate_text,
        "confidence": anpr.confidence,
        "matched_vehicle_id": matched_vehicle_id,
        "is_registered": is_registered,
        "registration_status": "REGISTERED" if is_registered else "UNREGISTERED",
        "vehicle_capacity": vehicle_capacity,
        "driver": driver_name,
        "assigned_farmer": assigned_farmer_name,
        "manual_review_required": anpr.manual_review_required,
        "image_url": upload_meta["url"],
        "notes": anpr.notes,
    }


@router.get("/gate-logs")
async def get_gate_logs(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(GateLogModel).order_by(GateLogModel.id.desc()).limit(50))
    return [
        {
            "id": g.id, "image_url": g.image_url, "detected_plate": g.detected_plate,
            "matched_vehicle_id": g.matched_vehicle_id, "confidence": g.confidence,
            "decision": g.decision, "booking_farmer_id": g.booking_farmer_id,
            "notes": g.notes, "created_at": g.created_at.isoformat() if g.created_at else None,
        }
        for g in result.scalars().all()
    ]
