import urllib.parse
from sqlalchemy.ext.asyncio import (
    create_async_engine,
    AsyncSession,
    async_sessionmaker,
)

from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import select
from sqlalchemy.engine.url import make_url

from app.core.config import settings

# =====================================================
# SUPABASE POSTGRESQL DATABASE URL
# =====================================================

from pathlib import Path

def sanitize_db_url(url: str) -> str:
    if "sqlite" in url:
        return url
    if "://" not in url:
        return url
    
    scheme, rest = url.split("://", 1)
    
    # Separate authority from path/query
    if "/" in rest:
        authority, path = rest.split("/", 1)
        path = "/" + path
    else:
        authority = rest
        path = ""
        
    # The last '@' in authority separates userinfo from host_port
    if "@" in authority:
        userinfo, host_port = authority.rsplit("@", 1)
        if ":" in userinfo:
            username, password = userinfo.split(":", 1)
            # Quote/URL-encode username and password (unquoting first to prevent double encoding)
            encoded_username = urllib.parse.quote_plus(urllib.parse.unquote(username))
            encoded_password = urllib.parse.quote_plus(urllib.parse.unquote(password))
            authority = f"{encoded_username}:{encoded_password}@{host_port}"
        else:
            encoded_user = urllib.parse.quote_plus(urllib.parse.unquote(userinfo))
            authority = f"{encoded_user}@{host_port}"
            
    return f"{scheme}://{authority}{path}"

import os

IS_VERCEL = os.environ.get("VERCEL") == "1"

DB_URL = sanitize_db_url(settings.DATABASE_URL)

if DB_URL.startswith("postgresql+psycopg2://"):
    DB_URL = DB_URL.replace("postgresql+psycopg2://", "postgresql+asyncpg://", 1)
elif DB_URL.startswith("postgresql://"):
    DB_URL = DB_URL.replace("postgresql://", "postgresql+asyncpg://", 1)
elif DB_URL.startswith("postgres://"):
    DB_URL = DB_URL.replace("postgres://", "postgresql+asyncpg://", 1)

# Resolve sslmode query parameter issue for asyncpg driver
DB_URL = DB_URL.replace("sslmode=", "ssl=")

# Fallback to SQLite if remote database host is unreachable
if "sqlite" not in DB_URL:
    import socket
    host = "unknown"
    try:
        url_parsed = make_url(DB_URL)
        host = url_parsed.host
        if host:
            socket.getaddrinfo(host, None)
        else:
            raise ValueError("No host specified in database URL")
    except Exception as e:
        print(f"[Database] Warning: Remote host '{host}' is unreachable ({e}). Falling back to local SQLite.")
        if IS_VERCEL:
            DB_URL = "sqlite+aiosqlite:////tmp/rice_system.db"
        else:
            backend_dir = Path(__file__).resolve().parents[2]
            DB_URL = f"sqlite+aiosqlite:///{backend_dir / 'rice_system.db'}"

if DB_URL.startswith("sqlite"):
    if IS_VERCEL:
        DB_URL = "sqlite+aiosqlite:////tmp/rice_system.db"
    else:
        backend_dir = Path(__file__).resolve().parents[2]
        # Extract filename/relative path (e.g. ./rice_system.db or rice_system.db)
        prefix = "sqlite+aiosqlite:///"
        if DB_URL.startswith(prefix):
            path_part = DB_URL[len(prefix):].lstrip(".").lstrip("/")
# Force test database URL under testing environment
if os.environ.get("TESTING") == "1":
    backend_dir = Path(__file__).resolve().parents[2]
    absolute_db_path = (backend_dir / 'rice_ams_wms' / 'database' / 'rice_ams_test.db').resolve()
    DB_URL = f"sqlite+aiosqlite:///{absolute_db_path}"

# =====================================================
# DATABASE ENGINE
# =====================================================

engine = create_async_engine(
    DB_URL,
    echo=False,
    future=True,
)

# =====================================================
# SESSION FACTORY
# =====================================================

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

# =====================================================
# BASE MODEL
# =====================================================

class Base(DeclarativeBase):
    pass


# =====================================================
# DATABASE DEPENDENCY
# =====================================================

async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


# =====================================================
# CREATE TABLES
# =====================================================

async def create_tables():

    # Import all models so SQLAlchemy can register them
    from app.models import (
        farmer,
        bags,
        warehouse,
        vehicle,
        sms_log,
        weather,
        price,
    )

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


# =====================================================
# SEED DATABASE
# =====================================================

async def seed_database():

    from app.models.farmer import FarmerModel
    from app.models.bags import BatchModel
    from app.models.warehouse import (
        StockModel,
        ZoneModel,
        LedgerModel,
    )
    from app.models.vehicle import VehicleModel
    from app.models.sms_log import SMSLogModel
    from app.models.weather import ChecklistModel
    from app.models.price import VarietyPriceModel

    async with AsyncSessionLocal() as db:

        # =====================================================
        # CHECK IF DATA EXISTS
        # =====================================================

        result = await db.execute(
            select(FarmerModel).limit(1)
        )

        if result.scalars().first():
            price_check = await db.execute(
                select(VarietyPriceModel).limit(1)
            )
            if price_check.scalars().first():
                print("OK: Database already seeded")
                return

            print("Seeding missing variety prices...")
            prices_data = [
                VarietyPriceModel(variety='Sona Masoori', price_per_kg=33.0),
                VarietyPriceModel(variety='IR-64', price_per_kg=28.5),
                VarietyPriceModel(variety='Basmati', price_per_kg=39.0),
                VarietyPriceModel(variety='HMT', price_per_kg=26.0),
                VarietyPriceModel(variety='IR-36', price_per_kg=25.0),
                VarietyPriceModel(variety='Pusa Basmati', price_per_kg=42.0),
                VarietyPriceModel(variety='Swarna', price_per_kg=24.0),
                VarietyPriceModel(variety='PR 106', price_per_kg=25.5),
            ]
            db.add_all(prices_data)
            await db.commit()
            print("OK: Variety prices seeded successfully")
            return

        print("Seeding database...")

        # =====================================================
        # FARMERS
        # =====================================================

        farmers_data = [
            FarmerModel(
                token="F024",
                name="Ramesh Yadav",
                mobile="+91 98765 43210",
                village="Hadapsar",
                aadhaar_last4="4321",
                variety="Sona Masoori",
                bags=120,
                status="waiting",
                wait_minutes=12,
                arrived_at="10:15 AM",
                email="ramesh.yadav@example.com",
                cultivated_area=3.0,
                harvest_date="2026-06-25",
                predicted_yield_kg=6000.0,
                recommended_vehicle="Mini truck",
                slot_date="2026-06-25",
                slot_time="09:00 AM",
                assigned_vehicle="MH14CD9087",
            ),
            FarmerModel(
                token="F025",
                name="Sita Devi",
                mobile="+91 97654 32109",
                village="Wagholi",
                aadhaar_last4="8765",
                variety="IR-64",
                bags=85,
                status="waiting",
                wait_minutes=25,
                arrived_at="10:18 AM",
                email="sita.devi@example.com",
                cultivated_area=2.125,
                harvest_date="2026-06-25",
                predicted_yield_kg=4250.0,
                recommended_vehicle="Mini truck",
                slot_date="2026-06-25",
                slot_time="11:30 AM",
                assigned_vehicle="MH12AB4521",
            ),
            FarmerModel(
                token="F026",
                name="Mahesh Kumar",
                mobile="+91 96543 21098",
                village="Kharadi",
                aadhaar_last4="2341",
                variety="Basmati",
                bags=200,
                status="waiting",
                wait_minutes=38,
                arrived_at="10:20 AM",
                email="mahesh.kumar@example.com",
                cultivated_area=5.0,
                harvest_date="2026-06-25",
                predicted_yield_kg=10000.0,
                recommended_vehicle="Medium truck",
                slot_date="2026-06-25",
                slot_time="01:00 PM",
                assigned_vehicle="",
            ),
        ]

        db.add_all(farmers_data)

        # =====================================================
        # BATCHES
        # =====================================================

        batches_data = [
            BatchModel(
                batch_id="B-0082",
                farmer_name="Ravi Patil",
                farmer_mobile="+91 98765 43210",
                variety="Sona Masoori",
                total_bags=120,
                good=111,
                damaged=6,
                wet=3,
                damaged_indices="4,13,27,54,89,103",
                wet_indices="22,67,95",
                deduction_amount=840,
                scanned_at="10:30 AM",
                status="Approved",
            ),
            BatchModel(
                batch_id="B-0081",
                farmer_name="Sunita Deshpande",
                farmer_mobile="+91 97654 32109",
                variety="IR-64",
                total_bags=85,
                good=80,
                damaged=3,
                wet=2,
                damaged_indices="8,31,60",
                wet_indices="15,45",
                deduction_amount=420,
                scanned_at="10:00 AM",
                status="Approved",
            ),
        ]

        db.add_all(batches_data)

        # =====================================================
        # STOCK
        # =====================================================

        stock_data = [
            StockModel(
                variety="Sona Masoori",
                qty_kg=2200000.0,
                capacity_kg=2500000.0,
                zone="A",
                color="#2e7d45",
            ),
            StockModel(
                variety="IR-64",
                qty_kg=1800000.0,
                capacity_kg=2500000.0,
                zone="B",
                color="#1976d2",
            ),
            StockModel(
                variety="Basmati",
                qty_kg=1500000.0,
                capacity_kg=2500000.0,
                zone="B",
                color="#f5a623",
            ),
        ]

        db.add_all(stock_data)

        # =====================================================
        # CHECKLIST
        # =====================================================

        checklist_data = [
            ChecklistModel(
                text='Inspect tarpaulin covers',
                priority='high',
            ),
            ChecklistModel(
                text='Confirm unloading crew',
                priority='medium',
            ),
            ChecklistModel(
                text='Check entry gate water drainage',
                priority='medium',
            ),
        ]

        db.add_all(checklist_data)

        # =====================================================
        # ZONES
        # =====================================================

        zones_data = [
            ZoneModel(
                zone_id="A",
                name="Warehouse A",
                variety="Sona Masoori",
                pct=88,
                temp_c=27,
                status="safe",
                label="Normal",
            ),
            ZoneModel(
                zone_id="B",
                name="Warehouse B",
                variety="IR-64",
                pct=72,
                temp_c=29,
                status="warn",
                label="Monitor",
            ),
            ZoneModel(
                zone_id="C",
                name="Open Yard C",
                variety="Basmati",
                pct=61,
                temp_c=31,
                status="danger",
                label="Cover stock",
            ),
        ]

        db.add_all(zones_data)

        # =====================================================
        # LEDGER
        # =====================================================

        ledger_data = [
            LedgerModel(
                time="09:30",
                variety="Sona Masoori",
                qty_kg=42500.0,
                zone="A",
                type="Inflow",
                operator="System",
            ),
            LedgerModel(
                time="10:00",
                variety="IR-64",
                qty_kg=18000.0,
                zone="B",
                type="Outflow",
                operator="Warehouse Manager",
            ),
            LedgerModel(
                time="10:15",
                variety="Basmati",
                qty_kg=25000.0,
                zone="C",
                type="Inflow",
                operator="System",
            ),
        ]

        db.add_all(ledger_data)

        # =====================================================
        # VEHICLES
        # =====================================================

        vehicles_data = [
            VehicleModel(
                vehicle_id="MH12AB4521",
                route="Sanaswadi to Warehouse A",
                load="150 bags SM",
                driver="Suresh Nair",
                driver_mobile="+91 98765 12340",
                progress_pct=45,
                status="enroute",
                schedule_time="11:30 AM",
            ),
            VehicleModel(
                vehicle_id="MH14CD9087",
                route="",
                load="",
                driver="Ganesh Patil",
                driver_mobile="+91 98765 12341",
                progress_pct=0,
                status="standby",
                schedule_time="",
            ),
            VehicleModel(
                vehicle_id="MH12EF3344",
                route="Engine maintenance",
                load="",
                driver="Rahul Shinde",
                driver_mobile="+91 98765 12342",
                progress_pct=0,
                status="offline",
                schedule_time="--",
            ),
        ]

        db.add_all(vehicles_data)

        # =====================================================
        # SMS LOGS
        # =====================================================

        sms_data = [
            SMSLogModel(
                type="queue",
                recipient="Ramesh Yadav",
                mobile="+91 98765 43210",
                message="Token F024 registered. Estimated wait: 17 min.",
                status="delivered",
                sent_at="10:16 AM",
            ),
            SMSLogModel(
                type="damage",
                recipient="Ravi Patil",
                mobile="+91 98765 43210",
                message="Batch B-0082 scan completed. 6 damaged and 3 wet bags found.",
                status="delivered",
                sent_at="10:31 AM",
            ),
            SMSLogModel(
                type="rain",
                recipient="Warehouse Operator",
                mobile="+91 98765 12345",
                message="Rain alert: cover stock in open yard.",
                status="delivered",
                sent_at="10:35 AM",
            ),
        ]

        db.add_all(sms_data)

        # Seed Variety Price data
        prices_data = [
            VarietyPriceModel(variety='Sona Masoori', price_per_kg=33.0),
            VarietyPriceModel(variety='IR-64', price_per_kg=28.5),
            VarietyPriceModel(variety='Basmati', price_per_kg=39.0),
            VarietyPriceModel(variety='HMT', price_per_kg=26.0),
            VarietyPriceModel(variety='IR-36', price_per_kg=25.0),
            VarietyPriceModel(variety='Pusa Basmati', price_per_kg=42.0),
            VarietyPriceModel(variety='Swarna', price_per_kg=24.0),
            VarietyPriceModel(variety='PR 106', price_per_kg=25.5),
        ]
        db.add_all(prices_data)

        await db.commit()

        print("OK: Database seeded successfully")
