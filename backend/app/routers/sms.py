from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import httpx
from app.core.database import get_db
from app.models.sms_log import SMSLogModel
from app.models.farmer import FarmerModel
from app.models.vehicle import VehicleModel
from app.core.config import settings

router = APIRouter()

class SMSSend(BaseModel):
    recipient_type: str   # farmer | all-farmers | operator | driver | broadcast
    mobile: Optional[str] = ""
    message_type: str
    message: str

class BulkSMS(BaseModel):
    type: str

def log_dict(l: SMSLogModel) -> dict:
    return {
        "id": l.id, "type": l.type, "recipient": l.recipient,
        "mobile": l.mobile, "message": l.message,
        "status": l.status, "sent_at": l.sent_at,
    }

async def dispatch_sms(mobile: str, message: str) -> bool:
    """Send SMS via Fast2SMS API (India). Returns True on success."""
    if not settings.SMS_API_KEY or settings.SMS_API_KEY == "your_fast2sms_api_key_here":
        # Simulate success in dev mode
        print(f"[DEV SMS] To: {mobile} | Msg: {message[:60]}...")
        return True
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                settings.SMS_GATEWAY_URL,
                headers={"authorization": settings.SMS_API_KEY},
                json={
                    "route": "v3",
                    "sender_id": settings.SMS_SENDER_ID,
                    "message": message,
                    "language": "english",
                    "flash": 0,
                    "numbers": mobile.replace("+91", "").replace(" ", "").strip(),
                },
            )
            data = resp.json()
            return data.get("return", False)
    except Exception as e:
        print(f"SMS error: {e}")
        return False

async def save_sms(db: AsyncSession, sms_type: str, recipient: str,
                   mobile: str, message: str, status: str) -> SMSLogModel:
    entry = SMSLogModel(
        type=sms_type, recipient=recipient, mobile=mobile,
        message=message, status=status,
        sent_at=datetime.now().strftime("%I:%M %p"),
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return entry

@router.get("/log")
async def get_log(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SMSLogModel).order_by(SMSLogModel.id.desc()).limit(100))
    return [log_dict(l) for l in result.scalars().all()]

@router.post("/send")
async def send_sms(data: SMSSend, db: AsyncSession = Depends(get_db)):
    success = await dispatch_sms(data.mobile or "0000000000", data.message)
    status  = "delivered" if success else "failed"
    entry   = await save_sms(db, data.message_type, data.mobile or "—",
                              data.mobile or "—", data.message, status)
    return log_dict(entry)

@router.post("/bulk")
async def bulk_sms(data: BulkSMS, db: AsyncSession = Depends(get_db)):
    """Send SMS to all farmers matching the type."""
    result  = await db.execute(select(FarmerModel).where(FarmerModel.status.in_(["waiting","processing"])))
    farmers = result.scalars().all()
    sent = 0
    for f in farmers:
        if data.type == "queue":
            msg = (f"Dear {f.name}, your token {f.token} is in queue. "
                   f"Est. wait: ~{f.wait_minutes} min. Report to Counter 2. - APMC")
        elif data.type == "complete":
            msg = (f"Dear {f.name}, procurement complete! "
                   f"{f.bags} bags accepted. Collect receipt at Counter 1. - APMC")
        else:
            msg = f"Dear {f.name}, update from APMC Pimpri. - Rice Procurement Cell"
        ok = await dispatch_sms(f.mobile, msg)
        await save_sms(db, data.type, f.name, f.mobile, msg, "delivered" if ok else "failed")
        sent += 1
    return {"sent": sent, "message": f"Bulk SMS sent to {sent} farmers"}

@router.post("/rain-alert")
async def rain_alert(db: AsyncSession = Depends(get_db)):
    """Send rainfall alert to all operators."""
    operators = [
        {"name": "Yard A Operator", "mobile": "+91 94001 10001"},
        {"name": "Yard B Operator", "mobile": "+91 94001 10002"},
        {"name": "Yard C Operator", "mobile": "+91 94001 10003"},
        {"name": "Yard D Operator", "mobile": "+91 94001 10004"},
        {"name": "Warehouse A Mgr", "mobile": "+91 94001 10005"},
        {"name": "Warehouse B Mgr", "mobile": "+91 94001 10006"},
        {"name": "Supervisor",      "mobile": "+91 94001 10007"},
    ]
    msg  = ("RAIN ALERT: Heavy rainfall expected within 2 hours at Pimpri APMC. "
            "Cover all open stock immediately. Deploy tarpaulins. - APMC Supervisor")
    sent = 0
    for op in operators:
        ok = await dispatch_sms(op["mobile"], msg)
        await save_sms(db, "rain", op["name"], op["mobile"], msg, "delivered" if ok else "failed")
        sent += 1
    # Also alert vehicle drivers
    v_result = await db.execute(select(VehicleModel).where(VehicleModel.status == "enroute"))
    for v in v_result.scalars().all():
        driver_msg = (f"Driver {v.driver}, rain alert at APMC. "
                      "Delay expected. Please wait for dispatch instructions. - APMC Logistics")
        await dispatch_sms(v.driver_mobile, driver_msg)
        await save_sms(db, "rain", f"Driver {v.vehicle_id}", v.driver_mobile, driver_msg, "delivered")
        sent += 1
    return {"sent": sent, "message": f"Rain alert sent to {sent} recipients"}
