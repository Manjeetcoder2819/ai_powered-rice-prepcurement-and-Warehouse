from __future__ import annotations

import numpy as np
if not hasattr(np, "trapz"):
    np.trapz = np.trapezoid

import argparse
import json
from pathlib import Path

from app.services.yolo_models import (
    discover_datasets,
    normalize_dataset_yaml,
    publish_best_weight,
    vision_training_summary,
)


def _select_dataset(role: str, dataset_name: str | None = None):
    candidates = [
        dataset for dataset in discover_datasets()
        if dataset.role == role and dataset.yaml_valid
    ]
    if dataset_name:
        # Match against absolute path to allow resolving nested datasets vs. main datasets
        filtered = [d for d in candidates if dataset_name.lower().replace("/", "\\") in str(d.path).lower()]
        if filtered:
            return filtered[0]
        else:
            print(f"Warning: Requested dataset {dataset_name!r} not found. Falling back to default selection.")
            
    if not candidates:
        raise SystemExit(f"No valid {role!r} dataset found under backend/uploads.")
    return max(
        candidates,
        key=lambda dataset: (dataset.train_images + dataset.val_images, dataset.test_images),
    )


def train_role(role: str, epochs: int, image_size: int, base_model: str, dataset_name: str | None = None, batch: int = 16) -> Path:
    try:
        from ultralytics import YOLO
    except Exception as exc:
        raise SystemExit(
            "Ultralytics is not installed. Run: pip install ultralytics"
        ) from exc

    dataset = _select_dataset(role, dataset_name)
    data_yaml = normalize_dataset_yaml(dataset)
    print(
        json.dumps(
            {
                "role": role,
                "dataset": dataset.name,
                "classes": dataset.class_names,
                "train_images": dataset.train_images,
                "val_images": dataset.val_images,
                "normalized_yaml": str(data_yaml),
            },
            indent=2,
        )
    )

    model = YOLO(base_model)
    result = model.train(
        data=str(data_yaml),
        epochs=epochs,
        imgsz=image_size,
        batch=batch,
        project="runs/vision",
        name=f"{role}_detector",
        exist_ok=True,
    )
    save_dir = Path(getattr(result, "save_dir", Path("runs/vision") / f"{role}_detector"))
    published = publish_best_weight(save_dir, role)
    if not published:
        raise SystemExit(f"Training finished but no best.pt was found in {save_dir / 'weights'}.")
    return published


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Train local YOLO detectors from backend/uploads Roboflow datasets."
    )
    parser.add_argument(
        "--role",
        choices=["bag", "plate", "all", "status"],
        default="status",
        help="Detector to train. Use status to only print discovered datasets/models.",
    )
    parser.add_argument("--epochs", type=int, default=40)
    parser.add_argument("--imgsz", type=int, default=640)
    parser.add_argument("--base-model", default="yolov8n.pt")
    parser.add_argument("--dataset", default=None, help="Name or partial name of a dataset to use for training.")
    parser.add_argument("--batch", type=int, default=16, help="Batch size for training.")
    args = parser.parse_args()

    if args.role == "status":
        print(json.dumps(vision_training_summary(), indent=2))
        return

    roles = ["bag", "plate"] if args.role == "all" else [args.role]
    outputs = {}
    for role in roles:
        outputs[role] = str(train_role(role, args.epochs, args.imgsz, args.base_model, args.dataset, args.batch))
    print(json.dumps({"trained_weights": outputs}, indent=2))


if __name__ == "__main__":
    main()
