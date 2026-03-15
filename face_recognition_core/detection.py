"""
detection.py
────────────
Stage 1 – Face Detection using RetinaFace.

Returns, for each face in an image:
    bbox      : [x1, y1, x2, y2]  (pixel coords)
    landmarks : {left_eye, right_eye, nose, mouth_left, mouth_right}  (5 points)
    score     : detection confidence [0, 1]
"""
from __future__ import annotations

import logging
from typing import Any

import cv2
import numpy as np

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────────────────────────────────────
# Backend – try RetinaFace (retinaface package), fall back to Haar cascade
# ──────────────────────────────────────────────────────────────────────────────
try:
    from retinaface import RetinaFace as _RF

    _BACKEND = "retinaface"
    logger.info("Detection backend: RetinaFace")
except ImportError:
    _RF = None
    _BACKEND = "haar"
    logger.warning("retinaface not installed – falling back to Haar cascade")

# Haar cascade fallback
_haar_cascade: cv2.CascadeClassifier | None = None


def _get_haar() -> cv2.CascadeClassifier:
    global _haar_cascade
    if _haar_cascade is None:
        path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        _haar_cascade = cv2.CascadeClassifier(path)
    return _haar_cascade


# ──────────────────────────────────────────────────────────────────────────────
# Public API
# ──────────────────────────────────────────────────────────────────────────────
def detect(image_bgr: np.ndarray) -> list[dict[str, Any]]:
    """Detect all faces in *image_bgr* (H×W×3, uint8, BGR).

    Returns
    -------
    list of dicts, each with keys:
        bbox       : list[int]   [x1, y1, x2, y2]
        landmarks  : dict        {str: [float, float]}  — 5 named points
        score      : float       detection confidence
    """
    if _BACKEND == "retinaface":
        return _detect_retinaface(image_bgr)
    return _detect_haar(image_bgr)


# ──────────────────────────────────────────────────────────────────────────────
# RetinaFace implementation
# ──────────────────────────────────────────────────────────────────────────────
_LANDMARK_NAMES = ["left_eye", "right_eye", "nose", "mouth_left", "mouth_right"]


def _detect_retinaface(image_bgr: np.ndarray) -> list[dict[str, Any]]:
    try:
        raw = _RF.detect_faces(image_bgr)  # type: ignore[union-attr]
    except Exception as exc:
        logger.error("RetinaFace error: %s", exc)
        return []

    if not raw or not isinstance(raw, dict):
        return []

    results: list[dict[str, Any]] = []
    for _key, face in raw.items():
        facial_area = face.get("facial_area", [0, 0, 0, 0])
        x1, y1, x2, y2 = facial_area
        score = float(face.get("score", 1.0))

        lm_raw = face.get("landmarks", {})
        landmarks: dict[str, list[float]] = {}
        for name in _LANDMARK_NAMES:
            pt = lm_raw.get(name, [0.0, 0.0])
            landmarks[name] = [float(pt[0]), float(pt[1])]

        results.append(
            {
                "bbox": [int(x1), int(y1), int(x2), int(y2)],
                "landmarks": landmarks,
                "score": score,
            }
        )

    # Sort by descending confidence
    results.sort(key=lambda d: d["score"], reverse=True)
    return results


# ──────────────────────────────────────────────────────────────────────────────
# Haar cascade fallback (no landmark support – generates synthetic landmarks)
# ──────────────────────────────────────────────────────────────────────────────
def _detect_haar(image_bgr: np.ndarray) -> list[dict[str, Any]]:
    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
    cascade = _get_haar()
    detections = cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(30, 30))
    if not len(detections):
        return []

    results: list[dict[str, Any]] = []
    for x, y, w, h in detections:
        x1, y1, x2, y2 = int(x), int(y), int(x + w), int(y + h)
        landmarks = _synthetic_landmarks(x1, y1, x2, y2)
        results.append(
            {
                "bbox": [x1, y1, x2, y2],
                "landmarks": landmarks,
                "score": 0.9,
            }
        )
    return results


def _synthetic_landmarks(x1: int, y1: int, x2: int, y2: int) -> dict[str, list[float]]:
    """Estimate 5 facial landmarks from a bounding box (Haar fallback)."""
    w = x2 - x1
    h = y2 - y1
    return {
        "left_eye":    [x1 + w * 0.3, y1 + h * 0.35],
        "right_eye":   [x1 + w * 0.7, y1 + h * 0.35],
        "nose":        [x1 + w * 0.5, y1 + h * 0.55],
        "mouth_left":  [x1 + w * 0.35, y1 + h * 0.75],
        "mouth_right": [x1 + w * 0.65, y1 + h * 0.75],
    }
