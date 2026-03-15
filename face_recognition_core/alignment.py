"""
alignment.py
────────────
Stage 2 – Face Alignment.

Takes the bounding box and 5 facial landmarks produced by detection.py and
returns a 112×112 BGR aligned face chip, ready for feature extraction.

Primary backend : insightface.utils.face_align.norm_crop()
Fallback        : OpenCV affine warp using eye positions only
"""
from __future__ import annotations

import logging
from typing import Any

import cv2
import numpy as np

logger = logging.getLogger(__name__)

# Reference 5-point template (for 112×112 output) – ArcFace standard
_ARCFACE_SRC = np.array(
    [
        [38.2946, 51.6963],
        [73.5318, 51.5014],
        [56.0252, 71.7366],
        [41.5493, 92.3655],
        [70.7299, 92.2041],
    ],
    dtype=np.float32,
)

_OUTPUT_SIZE = (112, 112)

# ──────────────────────────────────────────────────────────────────────────────
# Try insightface (preferred)
# ──────────────────────────────────────────────────────────────────────────────
try:
    from insightface.utils import face_align as _FA  # type: ignore[import]

    _BACKEND = "insightface"
    logger.info("Alignment backend: insightface norm_crop")
except ImportError:
    _FA = None
    _BACKEND = "affine"
    logger.warning("insightface not installed – using affine fallback")


# ──────────────────────────────────────────────────────────────────────────────
# Public API
# ──────────────────────────────────────────────────────────────────────────────
def align_faces(
    image_bgr: np.ndarray,
    detections: list[dict[str, Any]],
) -> list[np.ndarray]:
    """Return a list of 112×112 BGR face chips, one per detection.

    Parameters
    ----------
    image_bgr  : H×W×3 uint8 BGR image (the original full frame).
    detections : output of detection.detect() – list of {bbox, landmarks, score}.

    Returns
    -------
    chips : list of np.ndarray, each shape (112, 112, 3), dtype uint8, BGR.
    """
    chips: list[np.ndarray] = []
    for det in detections:
        try:
            chip = _align_one(image_bgr, det)
            chips.append(chip)
        except Exception as exc:
            logger.warning("Alignment failed for one face: %s", exc)
    return chips


# ──────────────────────────────────────────────────────────────────────────────
# Internal helpers
# ──────────────────────────────────────────────────────────────────────────────
_LM_ORDER = ["left_eye", "right_eye", "nose", "mouth_left", "mouth_right"]


def _landmarks_to_array(landmarks: dict[str, list[float]]) -> np.ndarray:
    """Convert the landmarks dict to a (5, 2) float32 array in ArcFace order."""
    pts = []
    for name in _LM_ORDER:
        pt = landmarks.get(name, [0.0, 0.0])
        pts.append([float(pt[0]), float(pt[1])])
    return np.array(pts, dtype=np.float32)


def _align_one(image_bgr: np.ndarray, det: dict[str, Any]) -> np.ndarray:
    landmarks = det["landmarks"]
    lm_array = _landmarks_to_array(landmarks)

    if _BACKEND == "insightface":
        # norm_crop expects (H, W, C) BGR image and (5, 2) landmarks
        chip = _FA.norm_crop(image_bgr, lm_array, image_size=112)
        return chip  # already 112×112 BGR

    # ── Affine fallback ──────────────────────────────────────────────────────
    return _affine_align(image_bgr, lm_array)


def _affine_align(image_bgr: np.ndarray, src_pts: np.ndarray) -> np.ndarray:
    """Estimate affine transform from detected landmarks to ArcFace reference."""
    M, _ = cv2.estimateAffinePartial2D(
        src_pts,
        _ARCFACE_SRC,
        method=cv2.LMEDS,
    )
    if M is None:
        # Last-resort: just crop and resize the bounding box region
        return _crop_fallback(image_bgr, src_pts)
    chip = cv2.warpAffine(image_bgr, M, _OUTPUT_SIZE, flags=cv2.INTER_LINEAR)
    return chip


def _crop_fallback(image_bgr: np.ndarray, src_pts: np.ndarray) -> np.ndarray:
    """Crop around the landmark center of mass and resize to 112×112."""
    cx, cy = src_pts.mean(axis=0)
    h, w = image_bgr.shape[:2]
    half = 56
    x1 = max(0, int(cx - half))
    y1 = max(0, int(cy - half))
    x2 = min(w, int(cx + half))
    y2 = min(h, int(cy + half))
    crop = image_bgr[y1:y2, x1:x2]
    if crop.size == 0:
        return np.zeros((112, 112, 3), dtype=np.uint8)
    return cv2.resize(crop, _OUTPUT_SIZE)
