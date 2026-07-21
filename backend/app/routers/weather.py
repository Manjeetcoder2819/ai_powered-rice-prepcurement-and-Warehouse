from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from app.core.database import get_db
from app.models.weather import ChecklistModel

router = APIRouter()

class ChecklistUpdate(BaseModel):
    done: bool

@router.get("")
async def get_weather(
    rain_risk: float = 68.0,
    temp: float = 29.0,
    humidity: float = 74.0,
    wind: float = 14.0,
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(ChecklistModel).order_by(ChecklistModel.id))
    checklist = [
        {"id": c.id, "text": c.text, "priority": c.priority, "done": c.done}
        for c in result.scalars().all()
    ]
    
    from app.services.prediction import predict_weather_action
    
    def clamp(val, low, high):
        return max(low, min(high, val))
        
    r_factor = rain_risk / 68.0 if rain_risk > 0 else 0.0
    h_factor = humidity / 74.0 if humidity > 0 else 0.0
    w_factor = wind / 14.0 if wind > 0 else 0.0
    t_factor = temp / 29.0 if temp > 0 else 0.0

    yard_configs = [
        {
            "name": "Yard A", 
            "humidity": clamp(round(68.0 * h_factor, 1), 0.0, 100.0), 
            "wind": max(0.0, round(10.0 * w_factor, 1)), 
            "temp": clamp(round(29.0 * t_factor, 1), -10.0, 60.0), 
            "rain_risk": clamp(round(12.0 * r_factor, 1), 0.0, 100.0), 
            "desc": f"Wind: {max(0.0, round(10.0 * w_factor, 1))} km/h NW\nHumidity: {clamp(round(68.0 * h_factor, 1), 0.0, 100.0)}%"
        },
        {
            "name": "Yard B", 
            "humidity": clamp(round(76.0 * h_factor, 1), 0.0, 100.0), 
            "wind": max(0.0, round(16.0 * w_factor, 1)), 
            "temp": clamp(round(29.0 * t_factor, 1), -10.0, 60.0), 
            "rain_risk": clamp(round(45.0 * r_factor, 1), 0.0, 100.0), 
            "desc": f"Wind: {max(0.0, round(16.0 * w_factor, 1))} km/h N\nHumidity: {clamp(round(76.0 * h_factor, 1), 0.0, 100.0)}%"
        },
        {
            "name": "Yard C", 
            "humidity": clamp(round(86.0 * h_factor, 1), 0.0, 100.0), 
            "wind": max(0.0, round(22.0 * w_factor, 1)), 
            "temp": clamp(round(29.0 * t_factor, 1), -10.0, 60.0), 
            "rain_risk": clamp(round(85.0 * r_factor, 1), 0.0, 100.0), 
            "desc": f"Wind: {max(0.0, round(22.0 * w_factor, 1))} km/h NE\nHumidity: {clamp(round(86.0 * h_factor, 1), 0.0, 100.0)}%"
        },
        {
            "name": "Yard D", 
            "humidity": clamp(round(65.0 * h_factor, 1), 0.0, 100.0), 
            "wind": max(0.0, round(8.0 * w_factor, 1)), 
            "temp": clamp(round(29.0 * t_factor, 1), -10.0, 60.0), 
            "rain_risk": clamp(round(5.0 * r_factor, 1), 0.0, 100.0), 
            "desc": f"Wind: {max(0.0, round(8.0 * w_factor, 1))} km/h W\nHumidity: {clamp(round(65.0 * h_factor, 1), 0.0, 100.0)}%"
        },
    ]
    
    yards = []
    for yc in yard_configs:
        action = predict_weather_action(yc["humidity"], yc["wind"], yc["temp"], yc["rain_risk"])
        if "stop unloading" in action or "alert operators" in action:
            status = "danger"
            desc = f"⚠ {action.capitalize()}"
        elif "cover" in action or "prepare" in action:
            status = "caution"
            desc = f"⚠ {action.capitalize()}"
        elif "monitor" in action:
            status = "caution"
            desc = action.capitalize()
        else:
            status = "safe"
            desc = action.capitalize()
            
        yards.append({
            "name": yc["name"],
            "status": status,
            "description": desc,
            "detail": f"{yc['desc']}\nRain Risk: {yc['rain_risk']}%"
        })

    # Dynamically generate 24h forecast display
    forecast = []
    hours = ["Now", "11AM", "12PM", "1PM", "2PM", "3PM", "4PM", "5PM"]
    for idx, hour in enumerate(hours):
        # vary temp and rain risk based on time offset to look realistic
        time_factor = 1.0 - (abs(4 - idx) / 5.0) # peaks around mid-forecast
        f_risk = clamp(round(rain_risk * (0.4 + 0.6 * time_factor)), 0, 100)
        f_temp = clamp(round(temp + 3 * (1 - time_factor)), -10, 60)
        
        if f_risk >= 75:
            icon = "🌧"
        elif f_risk >= 40:
            icon = "🌦"
        elif f_risk >= 20:
            icon = "🌥"
        else:
            icon = "☀️" if f_risk < 10 else "⛅"
            
        forecast.append({
            "time": hour,
            "icon": icon,
            "temp": f"{f_temp}°C",
            "rain_pct": f"{f_risk}%"
        })

    description = "Sunny" if rain_risk < 15 else ("Partly Cloudy" if rain_risk < 40 else ("Scattered Showers" if rain_risk < 75 else "Heavy Rainstorms"))

    return {
        "temp_c": round(temp),
        "description": description,
        "humidity": round(humidity),
        "wind_kmh": round(wind),
        "rain_risk_pct": round(rain_risk),
        "forecast": forecast,
        "yards": yards,
        "checklist": checklist,
    }

@router.patch("/checklist/{item_id}")
async def update_checklist(item_id: int, data: ChecklistUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ChecklistModel).where(ChecklistModel.id == item_id))
    item = result.scalars().first()
    if not item:
        raise HTTPException(status_code=404, detail="Checklist item not found")
    item.done = data.done
    await db.commit()
    return {"id": item.id, "done": item.done}
