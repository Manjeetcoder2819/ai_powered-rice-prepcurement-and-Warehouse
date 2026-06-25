from __future__ import annotations

import csv
from dataclasses import dataclass
from hashlib import sha256
from pathlib import Path
from random import Random
from statistics import mean
from typing import Iterable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.bags import BatchModel
from app.models.farmer import FarmerModel
from app.models.price import VarietyPriceModel


DATASET_DIR = Path(__file__).resolve().parents[2] / "datasets"
QUALITY_DATASET = DATASET_DIR / "rice_quality_training.csv"

DEFAULT_VARIETY_RISK = {
    "Sona Masoori": {"damaged_rate": 0.0523, "wet_rate": 0.0233},
    "IR-64": {"damaged_rate": 0.0531, "wet_rate": 0.0231},
    "Basmati": {"damaged_rate": 0.0532, "wet_rate": 0.0231},
}


@dataclass(frozen=True)
class QualityPrediction:
    damaged_rate: float
    wet_rate: float
    risk_level: str
    confidence: float
    expected_damaged: int
    expected_wet: int
    expected_good: int
    estimated_deduction: float


@dataclass(frozen=True)
class QualityTrainingRecord:
    variety: str
    total_bags: int
    damaged: int
    wet: int
    source: str


def _clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def _risk_level(damaged_rate: float, wet_rate: float) -> str:
    score = damaged_rate + (wet_rate * 1.5)
    if score >= 0.075:
        return "high"
    if score >= 0.04:
        return "medium"
    return "low"


def _seeded_random(*parts: object) -> Random:
    raw = "|".join(str(part) for part in parts)
    seed = int(sha256(raw.encode("utf-8")).hexdigest()[:16], 16)
    return Random(seed)


async def load_training_batches(db: AsyncSession) -> list[BatchModel]:
    result = await db.execute(select(BatchModel).order_by(BatchModel.id.desc()))
    return result.scalars().all()


def load_quality_dataset(path: Path = QUALITY_DATASET) -> list[QualityTrainingRecord]:
    if not path.exists():
        return []

    records: list[QualityTrainingRecord] = []
    with path.open("r", encoding="utf-8", newline="") as csv_file:
        for row in csv.DictReader(csv_file):
            records.append(
                QualityTrainingRecord(
                    variety=row["variety"],
                    total_bags=int(row["total_bags"]),
                    damaged=int(row["damaged"]),
                    wet=int(row["wet"]),
                    source=row.get("source", "dataset"),
                )
            )
    return records


def _rates_from_records(
    records: Iterable[QualityTrainingRecord],
    variety: str,
) -> tuple[list[float], list[float]]:
    damaged_rates: list[float] = []
    wet_rates: list[float] = []

    for record in records:
        if record.variety != variety or record.total_bags <= 0:
            continue
        damaged_rates.append(record.damaged / record.total_bags)
        wet_rates.append(record.wet / record.total_bags)

    return damaged_rates, wet_rates


def train_quality_profile(
    batches: Iterable[BatchModel],
    variety: str,
) -> tuple[float, float, float]:
    dataset_damaged, dataset_wet = _rates_from_records(
        load_quality_dataset(),
        variety,
    )
    damaged_rates: list[float] = list(dataset_damaged)
    wet_rates: list[float] = list(dataset_wet)

    for batch in batches:
        if not batch.total_bags or getattr(batch, "variety", None) != variety:
            continue
        damaged_rates.append(batch.damaged / batch.total_bags)
        wet_rates.append(batch.wet / batch.total_bags)

    fallback = DEFAULT_VARIETY_RISK.get(
        variety,
        {"damaged_rate": 0.053, "wet_rate": 0.023},
    )
    sample_count = len(damaged_rates)

    if sample_count == 0:
        return fallback["damaged_rate"], fallback["wet_rate"], 0.45

    confidence = _clamp(0.55 + sample_count * 0.05, 0.55, 0.9)
    damaged_rate = (mean(damaged_rates) * confidence) + (
        fallback["damaged_rate"] * (1 - confidence)
    )
    wet_rate = (mean(wet_rates) * confidence) + (
        fallback["wet_rate"] * (1 - confidence)
    )
    return damaged_rate, wet_rate, confidence


async def training_summary(db: AsyncSession) -> dict:
    dataset_records = load_quality_dataset()
    db_batches = await load_training_batches(db)

    varieties = sorted(
        {
            *DEFAULT_VARIETY_RISK.keys(),
            *(record.variety for record in dataset_records),
        }
    )

    profiles = []
    for variety in varieties:
        damaged_rate, wet_rate, confidence = train_quality_profile(db_batches, variety)
        profiles.append(
            {
                "variety": variety,
                "damaged_rate_pct": round(damaged_rate * 100, 2),
                "wet_rate_pct": round(wet_rate * 100, 2),
                "risk_level": _risk_level(damaged_rate, wet_rate),
                "confidence": round(confidence, 2),
            }
        )

    price_result = await db.execute(select(VarietyPriceModel))
    price_records = price_result.scalars().all()
    prices = [
        {"variety": item.variety, "price_per_kg": item.price_per_kg}
        for item in price_records
    ]

    return {
        "model": "offline_quality_risk_blended_average_v1",
        "dataset_file": str(QUALITY_DATASET),
        "dataset_records": len(dataset_records),
        "database_batches": len(db_batches),
        "profiles": profiles,
        "price_list": prices,
    }


async def price_summary(db: AsyncSession) -> dict:
    result = await db.execute(select(VarietyPriceModel))
    prices = result.scalars().all()
    return {
        "prices": [
            {"variety": item.variety, "price_per_kg": item.price_per_kg}
            for item in prices
        ],
        "average_price_per_kg": round(
            sum(item.price_per_kg for item in prices) / len(prices), 2
        ) if prices else 0.0,
        "price_count": len(prices),
    }


# Global variables to store trained weights
QUEUE_MODEL_WEIGHTS = None
WEATHER_MODEL_WEIGHTS = None
RECOMMENDED_ACTIONS = [
    "normal unloading",
    "monitor tarpaulin",
    "prepare covers",
    "cover open yard",
    "stop unloading and alert operators"
]

def invert_matrix(A: list[list[float]]) -> list[list[float]]:
    n = len(A)
    I = [[1.0 if i == j else 0.0 for j in range(n)] for i in range(n)]
    augmented = [A[i] + I[i] for i in range(n)]
    for i in range(n):
        pivot_row = i
        for r in range(i + 1, n):
            if abs(augmented[r][i]) > abs(augmented[pivot_row][i]):
                pivot_row = r
        if abs(augmented[pivot_row][i]) < 1e-9:
            raise ValueError("Matrix is singular.")
        augmented[i], augmented[pivot_row] = augmented[pivot_row], augmented[i]
        pivot = augmented[i][i]
        for c in range(i, 2 * n):
            augmented[i][c] /= pivot
        for r in range(n):
            if r != i:
                factor = augmented[r][i]
                for c in range(i, 2 * n):
                    augmented[r][c] -= factor * augmented[i][c]
    return [row[n:] for row in augmented]

def transpose(X: list[list[float]]) -> list[list[float]]:
    return [list(row) for row in zip(*X)]

def matmul(A: list[list[float]], B: list[list[float]]) -> list[list[float]]:
    n, m, p = len(A), len(A[0]), len(B[0])
    result = [[0.0 for _ in range(p)] for _ in range(n)]
    for i in range(n):
        for j in range(p):
            result[i][j] = sum(A[i][k] * B[k][j] for k in range(m))
    return result

def matmul_vec(A: list[list[float]], v: list[float]) -> list[float]:
    n, m = len(A), len(A[0])
    result = [0.0 for _ in range(n)]
    for i in range(n):
        result[i] = sum(A[i][k] * v[k] for k in range(m))
    return result

def solve_least_squares(X: list[list[float]], Y: list[float]) -> list[float]:
    XT = transpose(X)
    XTX = matmul(XT, X)
    XTX_inv = invert_matrix(XTX)
    XTY = matmul_vec(XT, Y)
    return matmul_vec(XTX_inv, XTY)

def train_queue_wait_model():
    """Trains a linear regression model to predict wait times based on queue position and bags."""
    global QUEUE_MODEL_WEIGHTS
    csv_path = DATASET_DIR / "queue_training.csv"
    if not csv_path.exists():
        # Fallback default heuristics
        QUEUE_MODEL_WEIGHTS = (0.0, 12.0, 1.0 / 18.0)
        return
    try:
        X = []
        Y = []
        with open(csv_path, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                qp = float(row['queue_position'])
                bg = float(row['bags'])
                X.append([1.0, qp, bg])
                Y.append(float(row['expected_wait_minutes']))
        
        weights = solve_least_squares(X, Y)
        QUEUE_MODEL_WEIGHTS = (weights[0], weights[1], weights[2])
    except Exception as e:
        print(f"[AI MODEL] Queue wait model training error: {e}")
        QUEUE_MODEL_WEIGHTS = (0.0, 12.0, 0.05)


def train_weather_model():
    """Trains a multi-variable linear regression model to predict recommended rain response actions."""
    global WEATHER_MODEL_WEIGHTS
    csv_path = DATASET_DIR / "weather_risk_training.csv"
    if not csv_path.exists():
        return
    try:
        X = []
        Y = []
        action_map = {act: idx for idx, act in enumerate(RECOMMENDED_ACTIONS)}
        with open(csv_path, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                h = float(row['humidity_pct'])
                w = float(row['wind_kmh'])
                t = float(row['temp_c'])
                rr = float(row['rain_risk_pct'])
                score = float(action_map.get(row.get('recommended_action'), 0))
                X.append([1.0, h, w, t, rr])
                Y.append(score)
        
        weights = solve_least_squares(X, Y)
        WEATHER_MODEL_WEIGHTS = weights
    except Exception as e:
        print(f"[AI MODEL] Weather model training error: {e}")


def predict_wait_minutes(queue_position: int, bags: int) -> int:
    """Predicts wait time using the trained linear model."""
    global QUEUE_MODEL_WEIGHTS
    if QUEUE_MODEL_WEIGHTS is None:
        train_queue_wait_model()
    
    w0, w1, w2 = QUEUE_MODEL_WEIGHTS
    pred = w0 + w1 * queue_position + w2 * bags
    return max(5, round(pred))


def predict_weather_action(humidity: float, wind: float, temp: float, rain_risk: float) -> str:
    """Predicts risk actions using the trained weather model."""
    global WEATHER_MODEL_WEIGHTS
    if WEATHER_MODEL_WEIGHTS is None:
        train_weather_model()
    
    if not WEATHER_MODEL_WEIGHTS:
        # Simple heuristic fallback
        if rain_risk >= 85:
            return RECOMMENDED_ACTIONS[4]
        elif rain_risk >= 65:
            return RECOMMENDED_ACTIONS[3]
        elif rain_risk >= 40:
            return RECOMMENDED_ACTIONS[2]
        elif rain_risk >= 20:
            return RECOMMENDED_ACTIONS[1]
        return RECOMMENDED_ACTIONS[0]
        
    w = WEATHER_MODEL_WEIGHTS
    pred = w[0] + w[1] * humidity + w[2] * wind + w[3] * temp + w[4] * rain_risk
    idx = max(0, min(len(RECOMMENDED_ACTIONS) - 1, round(pred)))
    return RECOMMENDED_ACTIONS[idx]


async def predict_farmer_quality(
    db: AsyncSession,
    farmer: FarmerModel,
) -> QualityPrediction:
    batches = await load_training_batches(db)
    damaged_rate, wet_rate, confidence = train_quality_profile(batches, farmer.variety)

    bag_volume_factor = _clamp((farmer.bags - 80) / 400, -0.08, 0.12)
    damaged_rate = _clamp(damaged_rate + (bag_volume_factor * 0.025), 0.005, 0.12)
    wet_rate = _clamp(wet_rate + (bag_volume_factor * 0.014), 0.0, 0.08)

    expected_damaged = round(farmer.bags * damaged_rate)
    expected_wet = round(farmer.bags * wet_rate)
    expected_good = max(0, farmer.bags - expected_damaged - expected_wet)

    return QualityPrediction(
        damaged_rate=round(damaged_rate, 4),
        wet_rate=round(wet_rate, 4),
        risk_level=_risk_level(damaged_rate, wet_rate),
        confidence=round(confidence, 2),
        expected_damaged=expected_damaged,
        expected_wet=expected_wet,
        expected_good=expected_good,
        estimated_deduction=expected_damaged * settings.BAG_DEDUCTION_RATE,
    )


async def predict_batch_scan(
    db: AsyncSession,
    farmer: FarmerModel,
) -> tuple[QualityPrediction, list[int], list[int]]:
    prediction = await predict_farmer_quality(db, farmer)
    rng = _seeded_random(farmer.token, farmer.name, farmer.mobile, farmer.bags)

    damaged_count = max(
        0,
        round(
            farmer.bags
            * _clamp(rng.normalvariate(prediction.damaged_rate, 0.006), 0, 0.16)
        ),
    )
    wet_count = max(
        0,
        round(
            farmer.bags
            * _clamp(rng.normalvariate(prediction.wet_rate, 0.004), 0, 0.1)
        ),
    )

    if damaged_count + wet_count > farmer.bags:
        wet_count = max(0, farmer.bags - damaged_count)

    bag_indices = list(range(1, farmer.bags + 1))
    rng.shuffle(bag_indices)
    damaged_indices = sorted(bag_indices[:damaged_count])
    wet_indices = sorted(bag_indices[damaged_count : damaged_count + wet_count])

    scan_prediction = QualityPrediction(
        damaged_rate=prediction.damaged_rate,
        wet_rate=prediction.wet_rate,
        risk_level=prediction.risk_level,
        confidence=prediction.confidence,
        expected_damaged=damaged_count,
        expected_wet=wet_count,
        expected_good=max(0, farmer.bags - damaged_count - wet_count),
        estimated_deduction=damaged_count * settings.BAG_DEDUCTION_RATE,
    )
    return scan_prediction, damaged_indices, wet_indices


async def upload_dataset_to_supabase():
    """Uploads the local quality training CSV dataset to Supabase Storage."""
    if not getattr(settings, "SUPABASE_URL", None) or not getattr(settings, "SUPABASE_ANON_KEY", None):
        print("[Supabase Storage] Missing credentials, skipping sync")
        return
        
    bucket_name = "datasets"
    file_path = QUALITY_DATASET
    if not file_path.exists():
        return
        
    url = f"{settings.SUPABASE_URL}/storage/v1/object/{bucket_name}/rice_quality_training.csv"
    headers = {
        "Authorization": f"Bearer {settings.SUPABASE_ANON_KEY}",
        "cache-control": "no-cache",
        "Content-Type": "text/csv",
        "x-upsert": "true"
    }
    
    try:
        import httpx
        async with httpx.AsyncClient() as client:
            with open(file_path, "rb") as f:
                content = f.read()
                # Try PUT first as it is standard for file updates in Supabase
                response = await client.put(url, content=content, headers=headers)
                if response.status_code in [200, 201]:
                    print(f"[Supabase Storage] Successfully synced dataset to Supabase Storage via PUT!")
                else:
                    # Fallback to POST
                    post_response = await client.post(url, content=content, headers=headers)
                    if post_response.status_code in [200, 201]:
                        print(f"[Supabase Storage] Successfully synced dataset to Supabase Storage via POST!")
                    else:
                        print(f"[Supabase Storage] Sync failed: {response.status_code} - {response.text}")
    except Exception as e:
        print(f"[Supabase Storage] Exception during sync: {e}")


async def append_quality_record(variety: str, total_bags: int, damaged: int, wet: int):
    try:
        import csv
        DATASET_DIR.mkdir(parents=True, exist_ok=True)
        file_exists = QUALITY_DATASET.exists()
        
        # Calculate realistic moisture
        moisture = round(12.5 + (wet / total_bags * 10.0) if total_bags > 0 else 12.5, 1)
        
        # Write/Append row
        with QUALITY_DATASET.open("a", encoding="utf-8", newline="") as csv_file:
            writer = csv.writer(csv_file)
            if not file_exists:
                writer.writerow(["variety", "total_bags", "damaged", "wet", "moisture_pct", "humidity_pct", "rain_risk_pct", "source"])
            writer.writerow([
                variety,
                total_bags,
                damaged,
                wet,
                moisture,
                70,  # default simulated humidity
                40,  # default simulated rain risk
                "live_scan"
            ])
            
        # Spawn Supabase upload
        await upload_dataset_to_supabase()
    except Exception as e:
        print(f"Failed to append record to quality dataset: {e}")

