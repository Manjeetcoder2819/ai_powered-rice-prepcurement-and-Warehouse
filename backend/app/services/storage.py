"""
app/services/storage.py

Unified file storage for uploaded images/videos (vehicle gate photos, bag
photos/videos, damage photos).

- If SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are configured, files are
  uploaded to a Supabase Storage bucket (SUPABASE_STORAGE_BUCKET, default
  "uploads") via the Storage REST API, and a public URL is returned.
- Otherwise, files are written to a local `uploads/` folder next to the
  backend app and served via the FastAPI static mount configured in
  `app/main.py`, so the whole system keeps working offline / without
  Supabase configured, per the offline-testing requirement in the test plan.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from pathlib import Path

import httpx

from app.core.config import settings

LOCAL_UPLOAD_DIR = Path(__file__).resolve().parents[2] / "uploads"
LOCAL_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

STORAGE_BUCKET = getattr(settings, "SUPABASE_STORAGE_BUCKET", "uploads") or "uploads"


def _supabase_configured() -> bool:
    return bool(settings.SUPABASE_URL and settings.SUPABASE_SERVICE_ROLE_KEY)


def _make_object_name(category: str, original_filename: str) -> str:
    ext = Path(original_filename).suffix or ".bin"
    stamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    return f"{category}/{stamp}_{uuid.uuid4().hex[:10]}{ext}"


async def save_upload(category: str, filename: str, content: bytes, content_type: str = "application/octet-stream") -> dict:
    """
    Save an uploaded file. Returns:
        {"url": <public or local-relative URL>, "backend": "supabase"|"local", "path": <object path>}
    """
    object_name = _make_object_name(category, filename)

    if _supabase_configured():
        upload_url = f"{settings.SUPABASE_URL.rstrip('/')}/storage/v1/object/{STORAGE_BUCKET}/{object_name}"
        headers = {
            "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}",
            "Content-Type": content_type,
            "x-upsert": "true",
        }
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(upload_url, content=content, headers=headers)
            if resp.status_code in (200, 201):
                public_url = (
                    f"{settings.SUPABASE_URL.rstrip('/')}/storage/v1/object/public/"
                    f"{STORAGE_BUCKET}/{object_name}"
                )
                return {"url": public_url, "backend": "supabase", "path": object_name}
            # Fall through to local storage on any non-2xx response.
        except httpx.HTTPError:
            pass  # network/storage issue -> fall back to local disk (offline mode)

    # Local fallback
    local_path = LOCAL_UPLOAD_DIR / object_name
    local_path.parent.mkdir(parents=True, exist_ok=True)
    local_path.write_bytes(content)
    return {"url": f"/uploads/{object_name}", "backend": "local", "path": str(local_path)}
