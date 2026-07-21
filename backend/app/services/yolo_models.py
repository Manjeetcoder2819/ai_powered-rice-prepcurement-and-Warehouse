from __future__ import annotations

import shutil
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np
if not hasattr(np, "trapz"):
    np.trapz = np.trapezoid


BACKEND_DIR = Path(__file__).resolve().parents[2]
UPLOADS_DIR = BACKEND_DIR / "uploads"
DATASETS_DIR = BACKEND_DIR.parent / "uploads"
if not (DATASETS_DIR.exists() and any(DATASETS_DIR.glob("*/data.yaml"))):
    DATASETS_DIR = UPLOADS_DIR
MODEL_DIR = BACKEND_DIR / "models" / "vision"
NORMALIZED_DATASET_DIR = BACKEND_DIR / "models" / "datasets"

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


@dataclass(frozen=True)
class DatasetInfo:
    role: str
    name: str
    path: Path
    yaml_path: Path
    class_names: list[str]
    train_images: int
    val_images: int
    test_images: int
    yaml_valid: bool
    notes: str = ""


@dataclass(frozen=True)
class Detection:
    label: str
    confidence: float
    box: tuple[int, int, int, int]


@dataclass(frozen=True)
class ModelStatus:
    role: str
    expected_weight: Path
    weight_exists: bool
    backend_available: bool
    loaded: bool
    datasets: list[DatasetInfo] = field(default_factory=list)
    notes: str = ""


_MODEL_CACHE: dict[str, Any] = {}


def _read_yaml_light(path: Path) -> dict[str, Any]:
    """Small data.yaml reader for Roboflow-style YOLO metadata.

    This avoids making the API depend on PyYAML just to list datasets. The
    trainer itself still passes a real YAML file to Ultralytics.
    """
    result: dict[str, Any] = {}
    lines = path.read_text(encoding="utf-8", errors="ignore").splitlines()
    i = 0
    while i < len(lines):
        raw = lines[i]
        line = raw.strip()
        i += 1
        if not line or line.startswith("#") or ":" not in line:
            continue

        key, value = line.split(":", 1)
        key = key.strip()
        value = value.strip()

        if key == "names":
            if value.startswith("[") and value.endswith("]"):
                names = value.strip("[]").replace("'", "").replace('"', "")
                result[key] = [part.strip() for part in names.split(",") if part.strip()]
            elif not value:
                names_map: dict[int, str] = {}
                while i < len(lines):
                    child = lines[i]
                    if child and not child.startswith((" ", "\t")):
                        break
                    child_line = child.strip()
                    i += 1
                    if ":" not in child_line:
                        continue
                    child_key, child_value = child_line.split(":", 1)
                    try:
                        names_map[int(child_key.strip())] = child_value.strip().strip("'\"")
                    except ValueError:
                        continue
                result[key] = [names_map[idx] for idx in sorted(names_map)]
            else:
                result[key] = [value.strip("'\"")]
        else:
            result[key] = value.strip("'\"")
    return result


def _count_images(path: Path) -> int:
    if not path.exists():
        return 0
    return sum(1 for item in path.iterdir() if item.is_file() and item.suffix.lower() in IMAGE_EXTENSIONS)


def _resolve_split_dir(dataset_dir: Path, configured: str) -> Path:
    configured_path = Path(configured)
    candidates = []
    if configured_path.is_absolute():
        candidates.append(configured_path)
    else:
        candidates.append((dataset_dir / configured_path).resolve())
        if configured.startswith("../"):
            candidates.append((dataset_dir / configured[3:]).resolve())
        candidates.append((dataset_dir.parent / configured_path).resolve())

    for candidate in candidates:
        if candidate.exists():
            return candidate
    return candidates[0] if candidates else dataset_dir / configured


def _role_from_dataset(path: Path, names: list[str]) -> str:
    haystack = " ".join([path.name, *names]).lower()
    if any(token in haystack for token in ("plate", "licence", "license", "number")):
        return "plate"
    if any(token in haystack for token in ("bag", "gunny", "counting")):
        return "bag"
    return "other"


def discover_datasets() -> list[DatasetInfo]:
    datasets: list[DatasetInfo] = []
    if not DATASETS_DIR.exists():
        return datasets

    for yaml_path in sorted(DATASETS_DIR.rglob("data.yaml")):
        dataset_dir = yaml_path.parent
        data = _read_yaml_light(yaml_path)
        names = [str(name) for name in data.get("names", [])]
        train_dir = _resolve_split_dir(dataset_dir, str(data.get("train", "train/images")))
        val_dir = _resolve_split_dir(dataset_dir, str(data.get("val", "valid/images")))
        test_dir = _resolve_split_dir(dataset_dir, str(data.get("test", "test/images")))
        train_count = _count_images(train_dir)
        val_count = _count_images(val_dir)
        test_count = _count_images(test_dir)
        yaml_valid = train_count > 0 and val_count > 0
        notes = "" if yaml_valid else "Training or validation image path could not be resolved."
        datasets.append(
            DatasetInfo(
                role=_role_from_dataset(dataset_dir, names),
                name=dataset_dir.name,
                path=dataset_dir,
                yaml_path=yaml_path,
                class_names=names,
                train_images=train_count,
                val_images=val_count,
                test_images=test_count,
                yaml_valid=yaml_valid,
                notes=notes,
            )
        )
    return datasets


def _weight_for_role(role: str) -> Path:
    return MODEL_DIR / f"{role}_detector.pt"


def _import_yolo():
    try:
        from ultralytics import YOLO
    except Exception:
        return None
    return YOLO


def load_model(role: str):
    if role in _MODEL_CACHE:
        return _MODEL_CACHE[role]

    weight = _weight_for_role(role)
    YOLO = _import_yolo()
    if YOLO is None or not weight.exists():
        return None

    model = YOLO(str(weight))
    _MODEL_CACHE[role] = model
    return model


def model_status(role: str) -> ModelStatus:
    YOLO = _import_yolo()
    weight = _weight_for_role(role)
    model = load_model(role)
    datasets = [dataset for dataset in discover_datasets() if dataset.role == role]
    if YOLO is None:
        notes = "Install ultralytics to train/use YOLO weights; API is using OpenCV fallback."
    elif not weight.exists():
        notes = f"Train or place weights at {weight}; API is using OpenCV fallback."
    else:
        notes = "Trained YOLO weights are available for inference."
    return ModelStatus(
        role=role,
        expected_weight=weight,
        weight_exists=weight.exists(),
        backend_available=YOLO is not None,
        loaded=model is not None,
        datasets=datasets,
        notes=notes,
    )


def vision_training_summary() -> dict[str, Any]:
    statuses = [model_status("bag"), model_status("plate")]
    return {
        "uploads_dir": str(UPLOADS_DIR),
        "model_dir": str(MODEL_DIR),
        "models": [
            {
                "role": status.role,
                "weight_file": str(status.expected_weight),
                "weight_exists": status.weight_exists,
                "ultralytics_available": status.backend_available,
                "loaded": status.loaded,
                "notes": status.notes,
                "datasets": [
                    {
                        "name": dataset.name,
                        "path": str(dataset.path),
                        "classes": dataset.class_names,
                        "train_images": dataset.train_images,
                        "val_images": dataset.val_images,
                        "test_images": dataset.test_images,
                        "yaml_valid": dataset.yaml_valid,
                        "notes": dataset.notes,
                    }
                    for dataset in status.datasets
                ],
            }
            for status in statuses
        ],
    }


def detect(role: str, image: Any, confidence: float = 0.25) -> list[Detection]:
    model = load_model(role)
    if model is None:
        return []

    results = model.predict(image, conf=confidence, verbose=False)
    detections: list[Detection] = []
    for result in results:
        names = getattr(result, "names", {}) or {}
        boxes = getattr(result, "boxes", None)
        if boxes is None:
            continue
        for box in boxes:
            xyxy = box.xyxy[0].tolist()
            cls_idx = int(box.cls[0].item()) if getattr(box, "cls", None) is not None else -1
            label = str(names.get(cls_idx, cls_idx))
            conf = float(box.conf[0].item()) if getattr(box, "conf", None) is not None else 0.0
            x1, y1, x2, y2 = [int(round(value)) for value in xyxy]
            detections.append(Detection(label=label, confidence=conf, box=(x1, y1, x2, y2)))
    return detections


def normalize_dataset_yaml(dataset: DatasetInfo) -> Path:
    """Create a trainer-safe data.yaml with absolute split paths."""
    NORMALIZED_DATASET_DIR.mkdir(parents=True, exist_ok=True)
    target = NORMALIZED_DATASET_DIR / f"{dataset.role}_{dataset.name.replace(' ', '_')}.yaml"
    data = _read_yaml_light(dataset.yaml_path)
    train_dir = _resolve_split_dir(dataset.path, str(data.get("train", "train/images")))
    val_dir = _resolve_split_dir(dataset.path, str(data.get("val", "valid/images")))
    test_dir = _resolve_split_dir(dataset.path, str(data.get("test", "test/images")))
    names = dataset.class_names or ["object"]
    content = [
        f"train: {train_dir.as_posix()}",
        f"val: {val_dir.as_posix()}",
        f"test: {test_dir.as_posix()}",
        f"nc: {len(names)}",
        "names:",
        *[f"  {idx}: {name}" for idx, name in enumerate(names)],
        "",
    ]
    target.write_text("\n".join(content), encoding="utf-8")
    return target


def publish_best_weight(run_dir: Path, role: str) -> Path | None:
    best = run_dir / "weights" / "best.pt"
    if not best.exists():
        return None
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    target = _weight_for_role(role)
    shutil.copy2(best, target)
    _MODEL_CACHE.pop(role, None)
    return target
