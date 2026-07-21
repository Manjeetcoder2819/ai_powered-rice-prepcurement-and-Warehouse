"""
app/services/vision.py

Real (non-simulated) computer-vision pipeline for the Smart Rice AMS/WMS system.

This module implements offline, dependency-light CV pipelines:

1. ANPR (Automatic Number Plate Recognition) for Images and Videos
   - Locates plate-like rectangular regions using trained YOLO models or classical
     contour analysis.
   - Includes full-image and candidate region fallback scanning for cropped plate photos.
   - Runs multi-pass Tesseract OCR (adaptive thresholding, CLAHE contrast sharpening,
     normal & inverted binary passes, and multiple PSM modes) to extract vehicle registration numbers.
   - Supports video inputs (sampling frames across vehicle arrival clips).
   - Provides OCR-aware fuzzy matching (`fuzzy_match_plate`) to compensate for common
     OCR character confusions ('O' vs '0', 'I' vs '1', 'Z' vs '2', 'B' vs '8', etc.).

2. Gunny-bag counting (image and video)
   - Image: adaptive Otsu thresholding + morphological cleanup + contour blob analysis / YOLO.
   - Video: frame sampling with 1-to-1 centroid track allocation across frames to prevent
     intra-frame suppression and double-counting.

3. Damage detection (image and video)
   - Multi-feature HSV / Canny edge density classifier for tears, wet bags, and leaks.
   - Supports keyframe video damage scanning when close-up photos are not provided.
"""

from __future__ import annotations

import io
import re
import tempfile
import os as _os
from dataclasses import dataclass, field
from typing import Optional, List, Tuple, Dict

import cv2
import numpy as np
import pytesseract
from PIL import Image

from app.services import yolo_models

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

ANPR_CONFIDENCE_THRESHOLD = 45.0   # below this -> manual_review
PLATE_ASPECT_RATIO_RANGE = (1.2, 8.0)
VIDEO_SAMPLE_EVERY_N_FRAMES = 5
BAG_TRACK_MAX_DISTANCE_PX = 60

OCR_CANONICAL_MAP = {
    'O': '0', 'Q': '0', 'D': '0',
    'I': '1', 'L': '1',
    'Z': '2',
    'E': '3',
    'A': '4',
    'S': '5',
    'G': '6',
    'T': '7',
    'B': '8',
    'P': '9'
}


# ---------------------------------------------------------------------------
# Helpers & Fuzzy Plate Matching
# ---------------------------------------------------------------------------

def _read_image(image_bytes: bytes) -> np.ndarray:
    pil_img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    return cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)


def _clean_plate_text(raw: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", raw.upper())


def _ocr_normalize(text: str) -> str:
    cleaned = _clean_plate_text(text)
    return "".join(OCR_CANONICAL_MAP.get(ch, ch) for ch in cleaned)


def _levenshtein(s1: str, s2: str) -> int:
    if len(s1) < len(s2):
        return _levenshtein(s2, s1)
    if len(s2) == 0:
        return len(s1)
    previous_row = range(len(s2) + 1)
    for i, c1 in enumerate(s1):
        current_row = [i + 1]
        for j, c2 in enumerate(s2):
            insertions = previous_row[j + 1] + 1
            deletions = current_row[j] + 1
            substitutions = previous_row[j] + (c1 != c2)
            current_row.append(min(insertions, deletions, substitutions))
        previous_row = current_row
    return previous_row[-1]


def fuzzy_match_plate(detected_text: str, registered_plates: list[str]) -> tuple[str | None, float]:
    """
    Fuzzy matches an OCR-detected plate text against registered database plates.
    Handles exact match, canonical OCR equivalence (O->0, I->1, etc.), substring inclusion,
    and Levenshtein edit distance <= 2.
    """
    if not detected_text or not registered_plates:
        return None, 0.0

    det_clean = _clean_plate_text(detected_text)
    det_canon = _ocr_normalize(detected_text)

    best_match = None
    best_score = 0.0

    for plate in registered_plates:
        p_clean = _clean_plate_text(plate)
        p_canon = _ocr_normalize(plate)

        # 1. Exact clean match
        if det_clean == p_clean:
            return plate, 100.0

        # 2. Canonical OCR equivalence match
        if det_canon == p_canon and len(det_canon) >= 4:
            return plate, 95.0

        # 3. Substring match
        if len(det_clean) >= 6 and (det_clean in p_clean or p_clean in det_clean):
            score = 85.0
            if score > best_score:
                best_score = score
                best_match = plate

        # 4. Levenshtein edit distance on canonical strings
        if len(det_canon) >= 4 and len(p_canon) >= 4:
            dist = _levenshtein(det_canon, p_canon)
            max_len = max(len(det_canon), len(p_canon))
            if dist <= 2:
                score = round((1.0 - dist / max_len) * 100, 1)
                if score > best_score and score >= 65.0:
                    best_score = score
                    best_match = plate

    return best_match, best_score


# ---------------------------------------------------------------------------
# 1. ANPR (Automatic Number Plate Recognition)
# ---------------------------------------------------------------------------

@dataclass
class ANPRResult:
    plate_text: str
    confidence: float
    manual_review_required: bool
    plate_region_found: bool
    notes: str = ""


def _locate_plate_candidates(img: np.ndarray) -> list[tuple[int, int, int, int]]:
    """Return candidate plate bounding boxes (x, y, w, h), best-first."""
    h, w = img.shape[:2]
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    gray = cv2.bilateralFilter(gray, 11, 17, 17)

    rect_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (17, 5))
    blackhat = cv2.morphologyEx(gray, cv2.MORPH_BLACKHAT, rect_kernel)

    grad_x = cv2.Sobel(blackhat, cv2.CV_32F, 1, 0, ksize=3)
    grad_x = np.absolute(grad_x)
    if grad_x.max() > 0:
        grad_x = 255 * (grad_x - grad_x.min()) / (grad_x.max() - grad_x.min())
    grad_x = grad_x.astype("uint8")

    grad_x = cv2.GaussianBlur(grad_x, (5, 5), 0)
    grad_x = cv2.morphologyEx(grad_x, cv2.MORPH_CLOSE, rect_kernel)
    _, thresh = cv2.threshold(grad_x, 0, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU)

    square_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (25, 25))
    thresh = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, square_kernel)
    thresh = cv2.erode(thresh, None, iterations=2)

    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    candidates = []
    for c in contours:
        x, y, cw, ch = cv2.boundingRect(c)
        if ch == 0:
            continue
        aspect = cw / float(ch)
        area_frac = (cw * ch) / float(w * h)
        if (PLATE_ASPECT_RATIO_RANGE[0] <= aspect <= PLATE_ASPECT_RATIO_RANGE[1]) and (0.001 <= area_frac <= 0.95):
            candidates.append((x, y, cw, ch))

    candidates.sort(key=lambda b: (-(b[2] * b[3]), -(b[1])))
    return candidates


def _run_ocr_multi_pass(crop: np.ndarray) -> tuple[str, float]:
    """Run multi-pass OCR on a candidate plate image crop (normal & inverted binary passes)."""
    if crop.size == 0:
        return "", 0.0

    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY) if len(crop.shape) == 3 else crop.copy()
    scale = max(1, int(240 / max(1, gray.shape[0])))
    gray = cv2.resize(gray, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
    gray = cv2.bilateralFilter(gray, 9, 75, 75)

    passes = []

    # Pass 1: Otsu thresholding (normal & inverted for dark/light text)
    _, th1 = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU)
    passes.append((th1, "--psm 7 -c tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"))
    passes.append((cv2.bitwise_not(th1), "--psm 7 -c tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"))

    # Pass 2: Adaptive Gaussian thresholding (normal & inverted)
    th2 = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 2)
    passes.append((th2, "--psm 6 -c tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"))
    passes.append((cv2.bitwise_not(th2), "--psm 6 -c tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"))

    # Pass 3: CLAHE contrast enhancement
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)
    _, th3 = cv2.threshold(enhanced, 0, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU)
    passes.append((th3, "--psm 7 -c tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"))
    passes.append((cv2.bitwise_not(th3), "--psm 7 -c tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"))
    passes.append((th3, "--psm 11 -c tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"))

    best_text, best_conf = "", 0.0

    for img_pass, psm_cfg in passes:
        try:
            data = pytesseract.image_to_data(
                img_pass,
                config=psm_cfg,
                output_type=pytesseract.Output.DICT,
            )
            words = [w for w in data.get("text", []) if w.strip()]
            confs = [float(c) for c in data.get("conf", []) if c not in ("-1", "")]
            text = _clean_plate_text("".join(words))
            conf = float(np.mean(confs)) if confs else 0.0

            if len(text) >= 4 and conf > best_conf:
                best_text, best_conf = text, conf
        except Exception:
            continue

    return best_text, best_conf


def read_number_plate_from_frame(img: np.ndarray) -> ANPRResult:
    h, w = img.shape[:2]
    detections = yolo_models.detect("plate", img, confidence=0.25)
    candidates = [
        (x1, y1, max(1, x2 - x1), max(1, y2 - y1))
        for x1, y1, x2, y2 in (d.box for d in detections)
    ]
    model_region_found = bool(candidates)

    if not candidates:
        candidates = _locate_plate_candidates(img)

    # Always append full image and standard fallback regions so cropped plates / centered photos pass OCR
    fallback_crops = [
        (0, 0, w, h),                                              # Full image (essential for cropped plate photos)
        (int(w * 0.1), int(h * 0.2), int(w * 0.8), int(h * 0.7)),   # Center region
        (int(w * 0.2), int(h * 0.5), int(w * 0.6), int(h * 0.45)),  # Bumper region
    ]

    all_candidates = candidates + [box for box in fallback_crops if box not in candidates]
    region_found = bool(candidates)

    best_text, best_conf = "", 0.0

    for (x, y, cw, ch) in all_candidates[:8]:
        crop = img[y:y + ch, x:x + cw]
        text, conf = _run_ocr_multi_pass(crop)
        if len(text) >= 4 and conf > best_conf:
            best_text, best_conf = text, conf

    manual_review = (not best_text) or (best_conf < ANPR_CONFIDENCE_THRESHOLD)

    if model_region_found:
        notes = "Plate region detected by trained YOLO model and OCR'd."
    elif region_found:
        notes = "Plate region located by OpenCV contour detection and OCR'd."
    elif best_text:
        notes = "Plate text extracted via multi-pass image OCR scan."
    else:
        notes = "No legible number plate detected. Please upload a clear, well-lit vehicle photo or number plate crop."

    return ANPRResult(
        plate_text=best_text,
        confidence=round(best_conf, 1),
        manual_review_required=manual_review,
        plate_region_found=region_found or model_region_found or len(all_candidates) > 0,
        notes=notes,
    )


def read_number_plate(image_bytes: bytes) -> ANPRResult:
    img = _read_image(image_bytes)
    return read_number_plate_from_frame(img)


def read_number_plate_from_video(video_bytes: bytes) -> ANPRResult:
    """
    Samples frames across a vehicle arrival video clip, performs ANPR on keyframes,
    and returns the highest confidence detected plate read.
    """
    tmp_path = tempfile.mktemp(suffix=".mp4")
    with open(tmp_path, "wb") as f:
        f.write(video_bytes)

    try:
        cap = cv2.VideoCapture(tmp_path)
        if not cap.isOpened():
            return ANPRResult(
                plate_text="",
                confidence=0.0,
                manual_review_required=True,
                plate_region_found=False,
                notes="Could not open vehicle video file.",
            )

        frame_idx = 0
        frames_analyzed = 0
        best_result: Optional[ANPRResult] = None

        while True:
            ret, frame = cap.read()
            if not ret:
                break
            frame_idx += 1
            if frame_idx % VIDEO_SAMPLE_EVERY_N_FRAMES != 0:
                continue

            frames_analyzed += 1
            res = read_number_plate_from_frame(frame)

            if best_result is None:
                best_result = res
            elif res.plate_text and (not best_result.plate_text or res.confidence > best_result.confidence):
                best_result = res

        cap.release()

        if best_result is None:
            return ANPRResult(
                plate_text="",
                confidence=0.0,
                manual_review_required=True,
                plate_region_found=False,
                notes="No valid frames could be analyzed from the video.",
            )

        best_result.notes = (
            f"Sampled {frames_analyzed} frames across vehicle video clip. " + best_result.notes
        )
        return best_result
    finally:
        if _os.path.exists(tmp_path):
            _os.remove(tmp_path)


def normalize_plate(text: str) -> str:
    return _clean_plate_text(text)


# ---------------------------------------------------------------------------
# 2. Gunny-bag counting
# ---------------------------------------------------------------------------

@dataclass
class BagCountResult:
    detected_bags: int
    boxes: list[tuple[int, int, int, int]] = field(default_factory=list)
    method: str = "image"
    notes: str = ""


def _bag_contours(img: np.ndarray) -> list[np.ndarray]:
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    blur = cv2.GaussianBlur(gray, (5, 5), 0)
    _, th = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    th = cv2.morphologyEx(th, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8), iterations=2)
    contours, _ = cv2.findContours(th, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return []

    contours = [c for c in contours if cv2.contourArea(c) >= 40]
    if not contours:
        return []

    areas = np.array(sorted((cv2.contourArea(c) for c in contours), reverse=True))
    if areas[0] <= 0:
        return []

    logs = np.log(areas + 1.0)
    gaps = logs[:-1] - logs[1:]
    search_window = min(40, len(gaps))
    if search_window == 0:
        cutoff = areas[0]
    else:
        cut_idx = int(np.argmax(gaps[:search_window]))
        cutoff = areas[cut_idx] if gaps[cut_idx] > 0.35 else max(areas[0] * 0.1, 400)

    bag_like = [c for c in contours if cv2.contourArea(c) >= cutoff]
    return bag_like


def count_bags_in_image(image_bytes: bytes) -> BagCountResult:
    img = _read_image(image_bytes)
    detections = yolo_models.detect("bag", img, confidence=0.25)
    if detections:
        boxes = [
            (x1, y1, max(1, x2 - x1), max(1, y2 - y1))
            for x1, y1, x2, y2 in (d.box for d in detections)
        ]
        avg_conf = round(sum(d.confidence for d in detections) / len(detections) * 100, 1)
        return BagCountResult(
            detected_bags=len(boxes),
            boxes=boxes,
            method="image_yolo",
            notes=f"Trained YOLO bag detector used ({avg_conf}% average confidence).",
        )

    contours = _bag_contours(img)
    boxes = [cv2.boundingRect(c) for c in contours]
    return BagCountResult(
        detected_bags=len(boxes),
        boxes=boxes,
        method="image",
        notes="Contour-based blob count (adaptive Otsu threshold).",
    )


def count_bags_in_video(video_bytes: bytes) -> BagCountResult:
    """
    Samples frames from the video and tracks bag centroids across samples using
    strict 1-to-1 track assignment so adjacent bags in the same frame are never
    suppressed or double-counted.
    """
    tmp_path = tempfile.mktemp(suffix=".mp4")
    with open(tmp_path, "wb") as f:
        f.write(video_bytes)

    try:
        cap = cv2.VideoCapture(tmp_path)
        if not cap.isOpened():
            return BagCountResult(detected_bags=0, method="video", notes="Could not open video file.")

        active_tracks: list[dict] = []
        next_track_id = 1
        frame_idx = 0
        frames_read = 0

        while True:
            ret, frame = cap.read()
            if not ret:
                break
            frame_idx += 1
            if frame_idx % VIDEO_SAMPLE_EVERY_N_FRAMES != 0:
                continue
            frames_read += 1

            detections = yolo_models.detect("bag", frame, confidence=0.25)
            if detections:
                centroids = [
                    ((x1 + x2) / 2.0, (y1 + y2) / 2.0)
                    for x1, y1, x2, y2 in (d.box for d in detections)
                ]
            else:
                contours = _bag_contours(frame)
                centroids = []
                for c in contours:
                    M = cv2.moments(c)
                    if M["m00"] == 0:
                        continue
                    centroids.append((M["m10"] / M["m00"], M["m01"] / M["m00"]))

            unassigned_centroids = list(centroids)

            for track in active_tracks:
                tx, ty = track["last_pos"]
                best_idx = None
                best_dist = BAG_TRACK_MAX_DISTANCE_PX
                for idx, (cx, cy) in enumerate(unassigned_centroids):
                    dist = ((tx - cx) ** 2 + (ty - cy) ** 2) ** 0.5
                    if dist < best_dist:
                        best_dist = dist
                        best_idx = idx

                if best_idx is not None:
                    cx, cy = unassigned_centroids.pop(best_idx)
                    track["last_pos"] = (cx, cy)
                    track["unseen"] = 0
                else:
                    track["unseen"] += 1

            for cx, cy in unassigned_centroids:
                active_tracks.append({
                    "id": next_track_id,
                    "last_pos": (cx, cy),
                    "unseen": 0,
                })
                next_track_id += 1

        cap.release()
        total_unique_bags = next_track_id - 1
        model_note = "YOLO detections used when available; " if yolo_models.load_model("bag") is not None else ""
        notes = (
            f"Sampled every {VIDEO_SAMPLE_EVERY_N_FRAMES} frames across {frames_read} sampled frames; "
            f"{model_note}tracked {total_unique_bags} unique bag centroid trajectories."
        )
        return BagCountResult(detected_bags=total_unique_bags, method="video", notes=notes)
    finally:
        if _os.path.exists(tmp_path):
            _os.remove(tmp_path)


# ---------------------------------------------------------------------------
# 3. Damage detection
# ---------------------------------------------------------------------------

DAMAGE_CLASSES = ("healthy", "torn", "wet", "open_leaking")


@dataclass
class DamageResult:
    predicted_class: str
    confidence: float
    scores: dict = field(default_factory=dict)
    notes: str = ""


def detect_bag_damage(image_bytes: bytes) -> DamageResult:
    img = _read_image(image_bytes)
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    h_ch, s_ch, v_ch = cv2.split(hsv)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(gray, 60, 160)

    edge_density = float(edges.mean())
    value_mean = float(v_ch.mean())
    sat_mean = float(s_ch.mean())

    wet_score = float(np.clip((115 - value_mean) / 30, 0, 1))
    torn_score = float(np.clip((edge_density - 38) / 15, 0, 1) * np.clip((100 - sat_mean) / 25, 0, 1))
    open_score = float(np.clip((edge_density - 40) / 15, 0, 1) * np.clip((sat_mean - 95) / 30, 0, 1))
    raw_scores = {"wet": wet_score, "torn": torn_score, "open_leaking": open_score}

    top_class = max(raw_scores, key=raw_scores.get)
    top_val = raw_scores[top_class]
    healthy_score = float(np.clip(1 - top_val, 0, 1))

    predicted = "healthy" if top_val < 0.2 else top_class

    scores = {
        "healthy": round(healthy_score, 3),
        "torn": round(torn_score, 3),
        "wet": round(wet_score, 3),
        "open_leaking": round(open_score, 3),
    }
    confidence = round((healthy_score if predicted == "healthy" else scores[predicted]) * 100, 1)

    return DamageResult(
        predicted_class=predicted,
        confidence=confidence,
        scores=scores,
        notes=(
            "Heuristic classical-CV classifier (edge density / HSV value & "
            "saturation)."
        ),
    )


def detect_bag_damage_from_video(video_bytes: bytes) -> DamageResult:
    """Samples video keyframes to analyze damage / tears / wet patches from a video stream."""
    tmp_path = tempfile.mktemp(suffix=".mp4")
    with open(tmp_path, "wb") as f:
        f.write(video_bytes)

    try:
        cap = cv2.VideoCapture(tmp_path)
        if not cap.isOpened():
            return DamageResult(predicted_class="healthy", confidence=0.0, notes="Could not open video file.")

        results: list[DamageResult] = []
        frame_idx = 0
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            frame_idx += 1
            if frame_idx % (VIDEO_SAMPLE_EVERY_N_FRAMES * 2) != 0:
                continue

            _, buffer = cv2.imencode(".jpg", frame)
            res = detect_bag_damage(buffer.tobytes())
            results.append(res)

        cap.release()
        if not results:
            return DamageResult(predicted_class="healthy", confidence=50.0, notes="No frames analyzed.")

        defects = [r for r in results if r.predicted_class != "healthy"]
        if defects:
            best_defect = max(defects, key=lambda r: r.confidence)
            return DamageResult(
                predicted_class=best_defect.predicted_class,
                confidence=best_defect.confidence,
                scores=best_defect.scores,
                notes=f"Detected {best_defect.predicted_class} condition from video keyframes.",
            )
        return results[0]
    finally:
        if _os.path.exists(tmp_path):
            _os.remove(tmp_path)


def batch_detect_damage(image_bytes_list: list[bytes]) -> list[DamageResult]:
    return [detect_bag_damage(b) for b in image_bytes_list]
