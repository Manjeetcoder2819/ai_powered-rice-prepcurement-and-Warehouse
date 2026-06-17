from __future__ import annotations

import csv
from dataclasses import dataclass
from pathlib import Path


DATASET_DIR = Path(__file__).resolve().parents[2] / "datasets"
VEHICLE_DATASET = DATASET_DIR / "vehicle_schedule_training.csv"


@dataclass(frozen=True)
class RoutePlan:
    route: str
    load: str
    variety: str
    priority: int
    eta_minutes: int
    rain_safe: bool


def load_route_plans(path: Path = VEHICLE_DATASET) -> list[RoutePlan]:
    if not path.exists():
        return []

    plans: list[RoutePlan] = []
    with path.open("r", encoding="utf-8", newline="") as csv_file:
        for row in csv.DictReader(csv_file):
            plans.append(
                RoutePlan(
                    route=row["route"],
                    load=row["load"],
                    variety=row["variety"],
                    priority=int(row["priority"]),
                    eta_minutes=int(row["eta_minutes"]),
                    rain_safe=row.get("rain_safe", "true").lower() == "true",
                )
            )

    return sorted(plans, key=lambda plan: (plan.priority, plan.eta_minutes))


def route_plan_to_message(plan: RoutePlan) -> str:
    return (
        f"{plan.route} | {plan.load} | ETA {plan.eta_minutes} min | "
        f"{'rain-safe' if plan.rain_safe else 'avoid during rain'}"
    )
