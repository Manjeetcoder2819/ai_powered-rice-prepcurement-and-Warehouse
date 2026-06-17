import asyncio
import json

from app.core.database import AsyncSessionLocal, create_tables, seed_database
from app.services.prediction import training_summary, train_queue_wait_model, train_weather_model


async def main() -> None:
    # Initialize and seed database if empty
    await create_tables()
    await seed_database()
    
    # Train ML models
    train_queue_wait_model()
    train_weather_model()
    
    async with AsyncSessionLocal() as db:
        summary = await training_summary(db)
        print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
