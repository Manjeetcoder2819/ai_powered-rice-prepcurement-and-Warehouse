
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import create_tables, seed_database
from app.routers import (
    dashboard,
    farmers,
    bags,
    warehouse,
    weather,
    vehicles,
    sms,
    email,
    reports,
    prices,
)

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        # Startup
        await create_tables()
        await seed_database()

        # Train AI models
        from app.services.prediction import train_queue_wait_model, train_weather_model
        train_queue_wait_model()
        train_weather_model()

        logger.info(
            f"{settings.WAREHOUSE_NAME} - Smart Rice System Online (AI Models Trained)"
        )

        yield

    except Exception as e:
        logger.error(f"Application startup failed: {str(e)}")
        raise

    finally:
        logger.info("System shutting down...")


app = FastAPI(
    title="Smart Rice Procurement & Warehouse API",
    description="Offline AI-Powered Rice Procurement System for APMC",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API Routers
app.include_router(
    dashboard.router,
    prefix="/api/v1/dashboard",
    tags=["Dashboard"],
)

app.include_router(
    farmers.router,
    prefix="/api/v1/farmers",
    tags=["Farmers"],
)

app.include_router(
    bags.router,
    prefix="/api/v1/bags",
    tags=["Bags"],
)

app.include_router(
    warehouse.router,
    prefix="/api/v1/warehouse",
    tags=["Warehouse"],
)

app.include_router(
    weather.router,
    prefix="/api/v1/weather",
    tags=["Weather"],
)

app.include_router(
    vehicles.router,
    prefix="/api/v1/vehicles",
    tags=["Vehicles"],
)

app.include_router(
    sms.router,
    prefix="/api/v1/sms",
    tags=["SMS"],
)

app.include_router(
    email.router,
    prefix="/api/v1/email",
    tags=["Email"],
)

app.include_router(
    reports.router,
    prefix="/api/v1/reports",
    tags=["Reports"],
)

app.include_router(
    prices.router,
    prefix="/api/v1/prices",
    tags=["Prices"],
)


@app.get("/")
async def root():
    return {
        "system": "Smart Rice Procurement & Warehouse Management",
        "version": app.version,
        "status": "online",
        "warehouse": settings.WAREHOUSE_NAME,
        "docs": "/docs",
        "health": "/health",
    }


@app.get("/health")
async def health():
    """
    Basic health endpoint.
    Later we can add actual database connectivity checks.
    """

    return {
        "status": "healthy",
        "database": "connected",
        "ai_mode": "offline",
        "version": app.version,
    }
