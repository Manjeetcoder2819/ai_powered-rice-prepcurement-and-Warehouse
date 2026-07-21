from datetime import datetime
from typing import Optional

import httpx
from fastapi import APIRouter, Depends
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.models.farmer import FarmerModel
from app.models.sms_log import SMSLogModel
from app.models.vehicle import VehicleModel

router = APIRouter()


class EmailSend(BaseModel):
    recipient_type: str = "manual"
    email: EmailStr
    recipient: Optional[str] = ""
    message_type: str
    subject: str
    message: str


class BulkEmail(BaseModel):
    type: str


def log_dict(l: SMSLogModel) -> dict:
    return {
        "id": l.id,
        "type": l.type,
        "recipient": l.recipient,
        "mobile": l.mobile,
        "message": l.message,
        "status": l.status,
        "sent_at": l.sent_at,
    }


async def dispatch_email(to_email: str, subject: str, message: str) -> bool:
    """Send email with SendGrid. Returns True when SendGrid accepts the request."""
    if (
        not settings.SENDGRID_API_KEY
        or settings.SENDGRID_API_KEY == "your_sendgrid_api_key_here"
        or not settings.SENDGRID_FROM_EMAIL
        or settings.SENDGRID_FROM_EMAIL == "verified_sender@example.com"
    ):
        print(f"[DEV EMAIL] To: {to_email} | Subject: {subject} | Msg: {message[:60]}...")
        return True

    payload = {
        "personalizations": [
            {
                "to": [{"email": to_email}],
                "subject": subject,
            }
        ],
        "from": {
            "email": settings.SENDGRID_FROM_EMAIL,
            "name": settings.SENDGRID_FROM_NAME,
        },
        "content": [{"type": "text/plain", "value": message}],
    }

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(
                settings.SENDGRID_API_URL,
                headers={
                    "Authorization": f"Bearer {settings.SENDGRID_API_KEY}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
        return response.status_code in (200, 202)
    except Exception as e:
        print(f"Email error: {e}")
        return False


async def save_email(
    db: AsyncSession,
    email_type: str,
    recipient: str,
    email: str,
    subject: str,
    message: str,
    status: str,
) -> SMSLogModel:
    entry = SMSLogModel(
        type=f"email:{email_type}",
        recipient=recipient,
        mobile=email,
        message=f"{subject} - {message}",
        status=status,
        sent_at=datetime.now().strftime("%I:%M %p"),
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return entry


@router.get("/log")
async def get_email_log(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(SMSLogModel)
        .where(SMSLogModel.type.like("email:%"))
        .order_by(SMSLogModel.id.desc())
        .limit(100)
    )
    return [log_dict(l) for l in result.scalars().all()]


@router.post("/send")
async def send_email(data: EmailSend, db: AsyncSession = Depends(get_db)):
    success = await dispatch_email(data.email, data.subject, data.message)
    status = "delivered" if success else "failed"
    entry = await save_email(
        db,
        data.message_type,
        data.recipient or data.recipient_type,
        data.email,
        data.subject,
        data.message,
        status,
    )
    return log_dict(entry)


@router.post("/bulk")
async def bulk_email(data: BulkEmail, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(FarmerModel).where(FarmerModel.status.in_(["waiting", "processing"]))
    )
    farmers = result.scalars().all()
    sent = 0
    skipped = 0

    for farmer in farmers:
        email = getattr(farmer, "email", None)
        if not email:
            skipped += 1
            continue

        if data.type == "queue":
            subject = f"Queue update for token {farmer.token}"
            msg = (
                f"Dear {farmer.name}, your token {farmer.token} is in queue. "
                f"Estimated wait: ~{farmer.wait_minutes} min. Report to Counter 2."
            )
        elif data.type == "complete":
            subject = "Procurement completed"
            msg = (
                f"Dear {farmer.name}, procurement complete. "
                f"{farmer.bags} bags accepted. Collect receipt at Counter 1."
            )
        else:
            subject = "APMC Pimpri update"
            msg = f"Dear {farmer.name}, update from APMC Pimpri."

        ok = await dispatch_email(email, subject, msg)
        await save_email(
            db,
            data.type,
            farmer.name,
            email,
            subject,
            msg,
            "delivered" if ok else "failed",
        )
        sent += 1

    return {
        "sent": sent,
        "skipped": skipped,
        "message": f"Bulk email sent to {sent} farmers; skipped {skipped} without email",
    }


@router.post("/rain-alert")
async def rain_alert_email(db: AsyncSession = Depends(get_db)):
    operator_emails = [
        email.strip()
        for email in settings.SENDGRID_OPERATOR_EMAILS.split(",")
        if email.strip()
    ]
    subject = "Rain alert for Pimpri APMC"
    msg = (
        "RAIN ALERT: Heavy rainfall expected within 2 hours at Pimpri APMC. "
        "Cover all open stock immediately. Deploy tarpaulins."
    )

    sent = 0
    for email in operator_emails:
        ok = await dispatch_email(email, subject, msg)
        await save_email(
            db,
            "rain",
            email,
            email,
            subject,
            msg,
            "delivered" if ok else "failed",
        )
        sent += 1

    v_result = await db.execute(select(VehicleModel).where(VehicleModel.status == "enroute"))
    for vehicle in v_result.scalars().all():
        driver_email = getattr(vehicle, "driver_email", None)
        if not driver_email:
            continue
        driver_msg = (
            f"Driver {vehicle.driver}, rain alert at APMC. "
            "Delay expected. Please wait for dispatch instructions."
        )
        ok = await dispatch_email(driver_email, subject, driver_msg)
        await save_email(
            db,
            "rain",
            f"Driver {vehicle.vehicle_id}",
            driver_email,
            subject,
            driver_msg,
            "delivered" if ok else "failed",
        )
        sent += 1

    return {"sent": sent, "message": f"Rain alert email sent to {sent} recipients"}
