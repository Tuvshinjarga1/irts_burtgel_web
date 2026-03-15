"""
pipeline.py
-----------
Orchestrates the complete face recognition pipeline:
    Detect -> Align -> Embed -> Classify/Verify + RL Threshold
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field

import numpy as np

from database  import FaceDatabase
from detection import detect, _synthetic_landmarks
from alignment import align_faces
from embedding import embed_batch
from rl_agent  import RLThresholdAgent
from similarity import find_best_match, find_top_k_matches

logger = logging.getLogger(__name__)


# ──────────────────────────────────────────────────────────────────────────────
# Result dataclass
# ──────────────────────────────────────────────────────────────────────────────
@dataclass
class FaceResult:
    bbox:       list[int]
    identity:   str
    confidence: float
    det_score:  float
    top_k:      list[dict] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "bbox":       self.bbox,
            "identity":   self.identity,
            "confidence": round(self.confidence, 4),
            "det_score":  round(self.det_score, 4),
            "top_k":      self.top_k,
        }


# ──────────────────────────────────────────────────────────────────────────────
# Singleton state
# ──────────────────────────────────────────────────────────────────────────────
_db    = FaceDatabase()
_agent = RLThresholdAgent()


def get_database() -> FaceDatabase:
    return _db


def get_agent() -> RLThresholdAgent:
    return _agent


# ──────────────────────────────────────────────────────────────────────────────
# IoU helpers
# ──────────────────────────────────────────────────────────────────────────────
def _iou(a: list[int], b: list[int]) -> float:
    ix1 = max(a[0], b[0])
    iy1 = max(a[1], b[1])
    ix2 = min(a[2], b[2])
    iy2 = min(a[3], b[3])
    inter = max(0, ix2 - ix1) * max(0, iy2 - iy1)
    if inter == 0:
        return 0.0
    area_a = (a[2] - a[0]) * (a[3] - a[1])
    area_b = (b[2] - b[0]) * (b[3] - b[1])
    return inter / float(area_a + area_b - inter)


def _pick_closest_detection(
    detections: list[dict],
    x1: int, y1: int, x2: int, y2: int,
    min_iou: float = 0.10,
) -> dict | None:
    best_det   = None
    best_score = min_iou
    target = [x1, y1, x2, y2]
    for det in detections:
        s = _iou(det["bbox"], target)
        if s > best_score:
            best_score = s
            best_det   = det
    return best_det


# ──────────────────────────────────────────────────────────────────────────────
# recognize()
# ──────────────────────────────────────────────────────────────────────────────

# How much the top score must exceed the 2nd-best candidate to accept a match.
# Prevents accidental matches when multiple people score similarly.
_MARGIN = 0.05


def recognize(image_bgr: np.ndarray) -> list[FaceResult]:
    """Detect → Align → Embed → Classify with uniqueness constraint."""

    # Stage 1: Detection
    detections = detect(image_bgr)
    if not detections:
        return []

    # Stage 2: Alignment
    chips = align_faces(image_bgr, detections)
    if not chips:
        return []

    det_chip_pairs = [
        (det, chip)
        for det, chip in zip(detections, chips)
        if chip is not None and chip.size > 0
    ]
    if not det_chip_pairs:
        return []

    aligned_dets  = [p[0] for p in det_chip_pairs]
    aligned_chips = [p[1] for p in det_chip_pairs]

    # Stage 3: Feature extraction
    embeddings = embed_batch(aligned_chips)

    # Stage 4: Classification — compute raw scores for every face
    db_store  = _db.items()
    threshold = _agent.threshold   # read-only here; changed only via /feedback

    raw: list[tuple[str, float, list[dict]]] = []
    for emb in embeddings:
        identity, score = find_best_match(emb, db_store, threshold)
        top_k = find_top_k_matches(emb, db_store, k=3, threshold=threshold)
        raw.append((identity, score, top_k))

    # ── Uniqueness constraint ─────────────────────────────────────────────────
    # Problem: FaceNet cosine similarity between similar-looking people of the
    # same demographic can reach 80–95 %.  Without this block every face in a
    # group photo would be labelled with the ONE registered person's name.
    #
    # Fix: each registered identity is assigned to AT MOST ONE face per image —
    #      the face with the HIGHEST similarity score for that identity.
    #      Every other face that would also match → "Unknown".
    #
    # Margin check: even the best-matching face must outscore its 2nd candidate
    #      by at least _MARGIN (5 pp) — filters ambiguous near-tie situations.

    # Pass A: find the winner index for each identity
    best_idx_for: dict[str, tuple[int, float]] = {}
    for i, (identity, score, _) in enumerate(raw):
        if identity != "Unknown":
            prev = best_idx_for.get(identity)
            if prev is None or score > prev[1]:
                best_idx_for[identity] = (i, score)

    # Pass B: apply uniqueness + margin; build final results
    results: list[FaceResult] = []
    for i, (det, (identity, score, top_k)) in enumerate(zip(aligned_dets, raw)):
        final_identity = identity

        if identity != "Unknown":
            winner_idx, _ = best_idx_for.get(identity, (-1, 0.0))

            if winner_idx != i:
                # Another face scored higher for this identity → this one loses
                final_identity = "Unknown"
            else:
                # Margin check: top score vs second candidate
                if len(top_k) >= 2:
                    if score - top_k[1]["score"] < _MARGIN:
                        final_identity = "Unknown"

        results.append(
            FaceResult(
                bbox=det["bbox"],
                identity=final_identity,
                confidence=score,
                det_score=det["score"],
                top_k=top_k,
            )
        )

    return results


# ──────────────────────────────────────────────────────────────────────────────
# register()
# ──────────────────────────────────────────────────────────────────────────────
def register(
    image_bgr: np.ndarray,
    name: str,
    bbox: list[int] | None = None,
) -> bool:
    """Add a face embedding for *name* to the database."""
    try:
        if bbox:
            x1, y1, x2, y2 = [int(v) for v in bbox]

            # Strategy 1: detect on FULL image, find the face closest to bbox
            detections = detect(image_bgr)
            det = _pick_closest_detection(detections, x1, y1, x2, y2)

            if det is not None:
                logger.info("register: matched detection (IoU>0.10).")
                chips = align_faces(image_bgr, [det])
            else:
                # Strategy 2: bbox is known but detector missed it — use
                # synthetic landmarks built from the bbox coordinates directly.
                logger.info("register: using synthetic landmarks from bbox %s.", bbox)
                lm = _synthetic_landmarks(x1, y1, x2, y2)
                synthetic_det = {"bbox": [x1, y1, x2, y2], "landmarks": lm, "score": 1.0}
                chips = align_faces(image_bgr, [synthetic_det])
        else:
            detections = detect(image_bgr)
            if not detections:
                logger.warning("register: no face detected.")
                return False
            det = sorted(detections, key=lambda d: d["score"], reverse=True)[0]
            chips = align_faces(image_bgr, [det])

        if not chips:
            logger.warning("register: alignment produced no chip.")
            return False

        embs = embed_batch(chips)
        if not embs:
            logger.warning("register: embedding failed.")
            return False

        _db.add(name, embs[0])
        _agent.reward_register(len(_db))
        logger.info("register: '%s' stored (db_size=%d).", name, len(_db))
        return True

    except Exception as exc:
        logger.error("register() failed: %s", exc)
        return False
