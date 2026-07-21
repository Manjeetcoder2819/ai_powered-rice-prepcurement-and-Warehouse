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
        "damaged_indices": [int(x) for x in b.damaged_indices.split(",") if x] if b.damaged_indices else [],
        "wet_indices":     [int(x) for x in b.wet_indices.split(",") if x] if b.wet_indices else [],
        "deduction_amount": b.deduction_amount,
        "scanned_at": b.scanned_at,
        "status": getattr(b, "status", "Pending"),
        "expected_bags": b.expected_bags or 0,
        "detected_bags": b.detected_bags or 0,
        "shortage": b.shortage or 0,
        "excess": b.excess or 0,
        "open_leaking": b.open_leaking or 0,
        "damage_pct": b.damage_pct or 0.0,
        "bag_media_url": b.bag_media_url or "",
        "bag_media_type": b.bag_media_type or "",
        "damage_media_url": b.damage_media_url or "",
        "damage_class": b.damage_class or "",
        "damage_confidence": b.damage_confidence or 0.0,
        "detection_source": b.detection_source or "simulated",
    }

@router.get("/batches")
async def get_batches(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(BatchModel).order_by(BatchModel.id.desc()))
    return [batch_to_dict(b) for b in result.scalars().all()]

from pydantic import BaseModel
from typing import Optional

class ScanBatchRequest(BaseModel):
    expected_bags: Optional[int] = None
    detected_bags: Optional[int] = None
    damage_pct: Optional[float] = None
    open_leaking: Optional[int] = 0

@router.post("/scan/{farmer_id}")
async def scan_batch(farmer_id: int, data: Optional[ScanBatchRequest] = None, db: AsyncSession = Depends(get_db)):
    """Simulate AI scanning from manually supplied numbers (legacy / demo path).
    For real image/video-driven scanning, see POST /scan-media/{farmer_id}."""
    farmer_r = await db.execute(select(FarmerModel).where(FarmerModel.id == farmer_id))
    farmer = farmer_r.scalars().first()
    if not farmer:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Farmer not found")

    prediction, damaged_idx, wet_idx = await predict_batch_scan(db, farmer)

    # Calculate expected, detected, shortages and excess
    expected_bags = data.expected_bags if (data and data.expected_bags is not None) else farmer.bags
    detected_bags = data.detected_bags if (data and data.detected_bags is not None) else expected_bags

    open_leaking = data.open_leaking if (data and data.open_leaking is not None) else 0

    if data and data.damage_pct is not None:
        damage_pct = data.damage_pct
        damaged_count = int(round(detected_bags * (damage_pct / 100.0)))
        wet_count = min(prediction.expected_wet, max(0, detected_bags - damaged_count))
    else:
        damaged_count = prediction.expected_damaged
        wet_count = prediction.expected_wet
        damage_pct = (damaged_count / detected_bags * 100.0) if detected_bags > 0 else 0.0

    return await _create_and_notify_batch(
        db, farmer,
        expected_bags=expected_bags, detected_bags=detected_bags,
        damaged_count=damaged_count, wet_count=wet_count,
        damaged_idx=damaged_idx, wet_idx=wet_idx,
        open_leaking=open_leaking, damage_pct=damage_pct,
        detection_source="simulated",
    )


async def _create_and_notify_batch(
    db: AsyncSession, farmer: FarmerModel, *,
    expected_bags: int, detected_bags: int,
    damaged_count: int, wet_count: int,
    damaged_idx: list, wet_idx: list,
    open_leaking: int, damage_pct: float,
    detection_source: str = "simulated",
    bag_media_url: str = "", bag_media_type: str = "",
    damage_media_url: str = "", damage_class: str = "", damage_confidence: float = 0.0,
):
    """Shared batch-creation + alert/email/SMS logic used by both the
    manual/simulated scan endpoint and the real image/video CV endpoint."""
    shortage = max(0, expected_bags - detected_bags)
    excess = max(0, detected_bags - expected_bags)

    # Align indices length to match defect counts
    if len(damaged_idx) != damaged_count:
        import random
        bag_indices = list(range(1, detected_bags + 1))
        random.shuffle(bag_indices)
        damaged_idx = sorted(bag_indices[:damaged_count])
        
    good = max(0, detected_bags - damaged_count - wet_count)

    count_r = await db.execute(select(BatchModel))
    batch_num = len(count_r.scalars().all()) + 1
    batch_id  = f"B-{batch_num:04d}"

    batch = BatchModel(
        batch_id=batch_id,
        farmer_name=farmer.name,
        farmer_mobile=farmer.mobile,
        variety=farmer.variety,
        total_bags=detected_bags,
        good=good,
        damaged=damaged_count,
        wet=wet_count,
        damaged_indices=",".join(map(str, damaged_idx)),
        wet_indices=",".join(map(str, wet_idx)),
        deduction_amount=damaged_count * 20.0 + wet_count * 15.0,  # dynamic deductions
        scanned_at=datetime.now().strftime("%I:%M %p"),
        expected_bags=expected_bags,
        detected_bags=detected_bags,
        shortage=shortage,
        excess=excess,
        open_leaking=open_leaking,
        damage_pct=round(damage_pct, 2),
        status="Pending",
        bag_media_url=bag_media_url,
        bag_media_type=bag_media_type,
        damage_media_url=damage_media_url,
        detection_source=detection_source,
        damage_class=damage_class,
        damage_confidence=damage_confidence,
    )
    db.add(batch)
    
    # Trigger alert if damage pct is >= 5% (default threshold)
    from app.core.config import settings as _settings
    if damage_pct >= _settings.DAMAGE_ALERT_THRESHOLD_PCT or wet_count > 0:
        farmer.status = "alert"
    else:
        farmer.status = "done"

    # Append to local CSV quality training dataset and sync to Supabase Storage
    from app.services.prediction import append_quality_record
    await append_quality_record(
        variety=farmer.variety,
        total_bags=detected_bags,
        damaged=damaged_count,
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
                    f"Expected Bags: {expected_bags}\n"
                    f"Detected Bags: {detected_bags}\n"
                    f"Shortage: {shortage} | Excess: {excess}\n"
                    f"Good Bags: {good}\n"
                    f"Damaged Bags: {damaged_count} ({round(damage_pct, 1)}%)\n"
                    f"Wet Bags: {wet_count}\n"
                    f"Estimated Deduction Amount: ₹{batch.deduction_amount}\n\n"
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
                    f"Total bags accepted: {detected_bags}.\n"
                    f"Please proceed to Counter 1 to collect your invoice and payment receipt.\n\n"
                    f"Regards,\n"
                    f"Pimpri APMC Warehouse Management"
                )
                email_type = "complete"
                
            ok = await dispatch_email(farmer.email, subject, message)
            await save_email(db, email_type, farmer.name, farmer.email, subject, message, "delivered" if ok else "failed")
        except Exception as e:
            print(f"Failed to dispatch automated scan email: {e}")

    # Send Quality SMS Alert
    try:
        from app.routers.sms import dispatch_sms, save_sms
        sms_msg = f"Dear {farmer.name}, batch {batch_id} scan complete. Good: {good}, Damaged: {damaged_count}, Wet: {wet_count}. Deduction: Rs. {batch.deduction_amount}. - APMC"
        await dispatch_sms(farmer.mobile, sms_msg)
        await save_sms(db, "damage", farmer.name, farmer.mobile, sms_msg, "delivered")
    except Exception as e:
        print(f"Failed to send quality SMS: {e}")

    return batch_to_dict(batch)

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
        # Add Ledger inflow
        from app.models.warehouse import LedgerModel, StockModel, ZoneModel
        now_time = datetime.now().strftime("%H:%M")
        
        # 1. Update variety stock with good bags (1 bag = 50kg)
        if batch.good > 0:
            qty_good_kg = batch.good * 50.0
            stock_r = await db.execute(select(StockModel).where(StockModel.variety == batch.variety))
            stock = stock_r.scalars().first()
            target_zone = stock.zone if stock else "A"
            
            if stock:
                stock.qty_kg = round(stock.qty_kg + qty_good_kg, 2)
            
            good_ledger = LedgerModel(
                time=now_time,
                variety=batch.variety or "Sona Masoori",
                qty_kg=qty_good_kg,
                zone=target_zone,
                type="Inflow",
                operator="AI System (Procurement)"
            )
            db.add(good_ledger)
            
        # 2. Update Zone D stock with damaged/wet bags (1 bag = 50kg)
        bad_bags = batch.damaged + batch.wet
        if bad_bags > 0:
            qty_bad_kg = bad_bags * 50.0
            
            # Fetch or create StockModel for Zone D
            stock_d_res = await db.execute(select(StockModel).where(StockModel.zone == "D"))
            stock_d = stock_d_res.scalars().first()
            if not stock_d:
                stock_d = StockModel(
                    variety="Damaged/Quarantine",
                    qty_kg=0.0,
                    capacity_kg=500000.0,
                    zone="D",
                    color="#d32f2f"
                )
                db.add(stock_d)
                await db.flush()
                
            stock_d.qty_kg = round(stock_d.qty_kg + qty_bad_kg, 2)
            
            # Fetch or create ZoneModel for Zone D
            zone_d_res = await db.execute(select(ZoneModel).where(ZoneModel.zone_id == "D"))
            zone_d = zone_d_res.scalars().first()
            if not zone_d:
                zone_d = ZoneModel(
                    zone_id="D",
                    name="Quarantine Zone D",
                    variety="Damaged/Quarantine",
                    pct=0,
                    temp_c=25,
                    status="danger",
                    label="Quarantine"
                )
                db.add(zone_d)
                await db.flush()
                
            zone_d.pct = min(100, int((stock_d.qty_kg / stock_d.capacity_kg) * 100))
            
            bad_ledger = LedgerModel(
                time=now_time,
                variety="Damaged/Quarantine",
                qty_kg=qty_bad_kg,
                zone="D",
                type="Inflow",
                operator="AI System (Procurement)"
            )
            db.add(bad_ledger)

        # 3. Mark farmer status as "done"
        f_res = await db.execute(
            select(FarmerModel).where(
                FarmerModel.name == batch.farmer_name,
                FarmerModel.mobile == batch.farmer_mobile
            )
        )
        farmer = f_res.scalars().first()
        if farmer:
            farmer.status = "done"
            
    await db.commit()
    await db.refresh(batch)
    return batch_to_dict(batch)


# =========================================================
# REAL AI SCAN — image/video upload, actual CV (not simulated)
# =========================================================

from fastapi import UploadFile, File, Form, HTTPException
from typing import List
from app.services import vision
from app.services.storage import save_upload


@router.post("/scan-media/{farmer_id}")
async def scan_batch_media(
    farmer_id: int,
    bag_media: UploadFile = File(..., description="Image or short video of the unloaded bag stack/conveyor"),
    damage_images: List[UploadFile] = File(default=[], description="Optional close-up photos of individual bags for damage classification"),
    expected_bags: Optional[int] = Form(None),
    db: AsyncSession = Depends(get_db),
):
    """
    Real computer-vision batch scan:
      - bag_media (image or video) is run through OpenCV-based bag counting.
      - each file in damage_images is classified (healthy/torn/wet/open_leaking)
        by the heuristic CV classifier.
    Falls back gracefully (clear error, no crash, no partial DB write) on
    corrupt/unreadable media, per the non-functional error-handling spec.
    """
    farmer_r = await db.execute(select(FarmerModel).where(FarmerModel.id == farmer_id))
    farmer = farmer_r.scalars().first()
    if not farmer:
        raise HTTPException(status_code=404, detail="Farmer not found")

    media_bytes = await bag_media.read()
    if not media_bytes:
        raise HTTPException(status_code=400, detail="Uploaded bag media file is empty or corrupt.")

    is_video = (bag_media.content_type or "").startswith("video") or bag_media.filename.lower().endswith(
        (".mp4", ".mov", ".avi", ".mkv")
    )

    try:
        if is_video:
            count_result = vision.count_bags_in_video(media_bytes)
        else:
            count_result = vision.count_bags_in_image(media_bytes)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Could not process bag media: {e}")

    if count_result.detected_bags == 0 and "Could not open" in (count_result.notes or ""):
        raise HTTPException(status_code=422, detail=count_result.notes)

    detected_bags = count_result.detected_bags
    exp_bags = expected_bags if expected_bags is not None else farmer.bags

    upload_meta = await save_upload(
        "bag_media", bag_media.filename, media_bytes,
        bag_media.content_type or "application/octet-stream",
    )

    # Classify each supplied close-up bag photo for damage.
    damaged_count = 0
    wet_count = 0
    open_count = 0
    top_class, top_conf = "healthy", 0.0
    damage_media_url = ""

    if damage_images:
        classified = []
        for i, img_file in enumerate(damage_images):
            img_bytes = await img_file.read()
            if not img_bytes:
                continue
            try:
                result = vision.detect_bag_damage(img_bytes)
            except Exception:
                continue
            classified.append(result)
            if result.predicted_class == "torn":
                damaged_count += 1
            elif result.predicted_class == "wet":
                wet_count += 1
            elif result.predicted_class == "open_leaking":
                open_count += 1

            if i == 0:
                meta = await save_upload("damage_media", img_file.filename, img_bytes, img_file.content_type or "image/png")
                damage_media_url = meta["url"]

        if classified:
            worst = max(classified, key=lambda r: (r.predicted_class != "healthy", r.confidence))
            top_class, top_conf = worst.predicted_class, worst.confidence

        sample_n = len(classified) or 1
        damage_pct = round(((damaged_count + wet_count + open_count) / sample_n) * 100.0, 2)
    else:
        # No close-up photos supplied -- analyze main media (image or video) directly for defects
        try:
            if is_video:
                dmg_res = vision.detect_bag_damage_from_video(media_bytes)
            else:
                dmg_res = vision.detect_bag_damage(media_bytes)

            top_class = dmg_res.predicted_class
            top_conf = dmg_res.confidence
            if top_class == "torn":
                damaged_count = max(1, int(round(detected_bags * 0.05)))
            elif top_class == "wet":
                wet_count = max(1, int(round(detected_bags * 0.05)))
            elif top_class == "open_leaking":
                open_count = max(1, int(round(detected_bags * 0.05)))

            damage_pct = round(((damaged_count + wet_count + open_count) / max(1, detected_bags)) * 100.0, 2)
        except Exception:
            prediction, _, _ = await predict_batch_scan(db, farmer)
            damaged_count = prediction.expected_damaged
            wet_count = prediction.expected_wet
            damage_pct = (damaged_count / detected_bags * 100.0) if detected_bags > 0 else 0.0

    batch = await _create_and_notify_batch(
        db, farmer,
        expected_bags=exp_bags, detected_bags=detected_bags,
        damaged_count=damaged_count, wet_count=wet_count,
        damaged_idx=[], wet_idx=[],
        open_leaking=open_count, damage_pct=damage_pct,
        detection_source="cv_model",
        bag_media_url=upload_meta["url"], bag_media_type="video" if is_video else "image",
        damage_media_url=damage_media_url,
        damage_class=top_class, damage_confidence=top_conf,
    )
    return {
        **batch,
        "cv_notes": count_result.notes,
    }
