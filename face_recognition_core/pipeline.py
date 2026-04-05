"""
pipeline.py
-----------
Orchestrates the complete face recognition pipeline using InsightFace ArcFace.
The FaceAnalysis class handles Detection, Alignment, and Embedding natively.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field

import numpy as np

from database  import FaceDatabase
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
# InsightFace Singleton
# ──────────────────────────────────────────────────────────────────────────────
_analyzer = None

def _get_analyzer():
    global _analyzer
    if _analyzer is None:
        try:
            import insightface
            from insightface.app import FaceAnalysis
            logger.info("Initializing InsightFace (buffalo_l)...")
            _analyzer = FaceAnalysis(name="buffalo_l", allowed_modules=['detection', 'recognition'])
            _analyzer.prepare(ctx_id=0, det_size=(640, 640))
            logger.info("InsightFace loaded.")
        except ImportError as exc:
            raise RuntimeError("insightface not installed. Please install it.") from exc
    return _analyzer


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


def _pick_closest_face(faces: list, x1: int, y1: int, x2: int, y2: int, min_iou: float = 0.10):
    best_face  = None
    best_score = min_iou
    target = [x1, y1, x2, y2]
    for f in faces:
        s = _iou(list(f.bbox), target)
        if s > best_score:
            best_score = s
            best_face = f
    return best_face


# ──────────────────────────────────────────────────────────────────────────────
# recognize()
# ──────────────────────────────────────────────────────────────────────────────

# How much the top score must exceed the 2nd-best candidate to accept a match.
# ArcFace discriminates well, so margin can be slightly larger if needed, but 0.01 is completely fine.
_MARGIN = 0.01


def recognize(image_bgr: np.ndarray) -> list[FaceResult]:
    """Detect → Embed → Classify with uniqueness constraint using ArcFace."""
    app = _get_analyzer()
    faces = app.get(image_bgr)
    
    if not faces:
        return []

    db_store  = _db.items()
    threshold = _agent.threshold   # read-only here; changed only via /feedback

    raw: list[tuple[str, float, list[dict]]] = []
    
    for f in faces:
        emb = f.normed_embedding
        identity, score = find_best_match(emb, db_store, threshold)
        top_k = find_top_k_matches(emb, db_store, k=3, threshold=threshold)
        raw.append((identity, score, top_k))

    # ── Uniqueness constraint ─────────────────────────────────────────────────
    best_idx_for: dict[str, tuple[int, float]] = {}
    for i, (identity, score, _) in enumerate(raw):
        if identity != "Unknown":
            prev = best_idx_for.get(identity)
            if prev is None or score > prev[1]:
                best_idx_for[identity] = (i, score)

    # Pass B: apply uniqueness + margin; build final results
    results: list[FaceResult] = []
    for i, (f, (identity, score, top_k)) in enumerate(zip(faces, raw)):
        final_identity = identity

        if identity != "Unknown":
            winner_idx, _ = best_idx_for.get(identity, (-1, 0.0))

            if winner_idx != i:
                final_identity = "Unknown"
            else:
                if len(top_k) >= 2:
                    if score - top_k[1]["score"] < _MARGIN:
                        final_identity = "Unknown"

        bbox = [int(v) for v in f.bbox]
        results.append(
            FaceResult(
                bbox=bbox,
                identity=final_identity,
                confidence=score,
                det_score=float(f.det_score),
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
        app = _get_analyzer()
        faces = app.get(image_bgr)
        
        if not faces:
            logger.warning("register: no face detected.")
            return False

        if bbox:
            x1, y1, x2, y2 = [int(v) for v in bbox]
            best_face = _pick_closest_face(faces, x1, y1, x2, y2)
            if best_face is None:
                logger.warning("register: could not match face to provided bbox.")
                return False
            target_face = best_face
        else:
            # pick highest detection score face
            target_face = sorted(faces, key=lambda f: f.det_score, reverse=True)[0]
            
        emb = target_face.normed_embedding
        if emb is None or emb.size == 0:
            logger.warning("register: embedding failed.")
            return False

        _db.add(name, emb)
        _agent.reward_register(len(_db))
        logger.info("register: '%s' stored (db_size=%d).", name, len(_db))
        return True

    except Exception as exc:
        logger.error("register() failed: %s", exc)
        return False
