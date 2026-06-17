from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite+aiosqlite:///./rice_system.db"
    SECRET_KEY: str = "rice-system-secret"
    SMS_GATEWAY_URL: str = "https://www.fast2sms.com/dev/bulkV2"
    SMS_API_KEY: str = ""
    SMS_SENDER_ID: str = "APMC"
    SENDGRID_API_KEY: str = ""
    SENDGRID_FROM_EMAIL: str = ""
    SENDGRID_FROM_NAME: str = "Pimpri APMC"
    SENDGRID_API_URL: str = "https://api.sendgrid.com/v3/mail/send"
    SENDGRID_OPERATOR_EMAILS: str = ""
    WAREHOUSE_NAME: str = "Pimpri APMC"
    WAREHOUSE_CAPACITY_MT: float = 2000.0
    BAG_DEDUCTION_RATE: float = 140.0
    ENVIRONMENT: str = "development"
    CORS_ORIGINS: List[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]
    SUPABASE_URL: str = ""
    SUPABASE_ANON_KEY: str = ""
    SUPABASE_SERVICE_ROLE_KEY: str = ""

    model_config = {
        "env_file": ".env",
        "extra": "ignore",
    }


settings = Settings()
