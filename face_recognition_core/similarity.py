"""
similarity.py
─────────────
Stage 4a – Cosine Similarity & Best-Match (Classification / Verification).

Two roles:
  1. VERIFICATION  – given two embeddings, return their cosine similarity score.
  2. CLASSIFICATION – given a query embedding and a database, return the best
                      matching identity (or "Unknown") and the similarity score.

Multi-embedding aggregation strategy
─────────────────────────────────────
Each person may have several stored embeddings (front, left profile, right
profile, looking_up …).  Simply taking the MAX over all ref embeddings gives an
overly optimistic score that is sensitive to one "lucky" vector.

We use a **softer aggregation**:
  • Compute cosine similarity for every stored embedding of a person.
  • Take the top-N scores (N = min(3, len(refs))).
  • Return their MEAN as the representative score for that identity.

This is more robust than raw-max while still being better than mean-all.
"""
from __future__ import annotations

import numpy as np


# ──────────────────────────────────────────────────────────────────────────────
# Core metric
# ──────────────────────────────────────────────────────────────────────────────
def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    """Return cosine similarity in [−1, 1] (1 = identical direction).

    Both *a* and *b* should be 1-D float32 vectors.  If they are already
    L2-normalised this is equivalent to their dot product.
    """
    a = a.astype(np.float64).flatten()
    b = b.astype(np.float64).flatten()
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a < 1e-8 or norm_b < 1e-8:
        return 0.0
    return float(np.dot(a, b) / (norm_a * norm_b))


# ──────────────────────────────────────────────────────────────────────────────
# Multi-embedding aggregation
# ──────────────────────────────────────────────────────────────────────────────
def _aggregate_score(query: np.ndarray, refs: list[np.ndarray]) -> float:
    """Return a robust similarity score for one identity given multiple refs.

    Strategy: MAX of cosine similarities. Since references vary widely in pose 
    (front, left profile, right profile), taking an average drags down the score 
    of a perfectly matching pose.
    """
    if not refs:
        return 0.0
    return float(max(cosine_similarity(query, r) for r in refs))


# ──────────────────────────────────────────────────────────────────────────────
# Verification helper
# ──────────────────────────────────────────────────────────────────────────────
def verify(
    embedding_a: np.ndarray,
    embedding_b: np.ndarray,
    threshold: float = 0.55,
) -> dict:
    """Verify whether two face embeddings belong to the same person.

    Returns
    -------
    dict with keys:
        same_person : bool
        score       : float  cosine similarity
        threshold   : float  threshold used
    """
    score = cosine_similarity(embedding_a, embedding_b)
    return {
        "same_person": score >= threshold,
        "score": score,
        "threshold": threshold,
    }


# ──────────────────────────────────────────────────────────────────────────────
# Classification / Best-match
# ──────────────────────────────────────────────────────────────────────────────
def find_best_match(
    query: np.ndarray,
    database: dict[str, list[np.ndarray]],
    threshold: float = 0.55,
) -> tuple[str, float]:
    """Find the best-matching identity in *database* for a query embedding.

    Parameters
    ----------
    query     : 512-D L2-normalised embedding.
    database  : mapping name → list of embeddings.
    threshold : minimum similarity score to accept a match.

    Returns
    -------
    (identity, score)
        identity = "Unknown" if no match exceeds the threshold.
        score    = best aggregated similarity found (0.0 if db is empty).
    """
    best_name  = "Unknown"
    best_score = 0.0

    for name, embeddings in database.items():
        score = _aggregate_score(query, embeddings)
        if score > best_score:
            best_score = score
            if score >= threshold:
                best_name = name

    return best_name, float(best_score)


def find_top_k_matches(
    query: np.ndarray,
    database: dict[str, list[np.ndarray]],
    k: int = 3,
    threshold: float = 0.55,
) -> list[dict]:
    """Return the top-k candidate identities for a query embedding.

    Uses the same multi-embedding aggregation as find_best_match so scores
    are consistent between the two functions.

    Returns
    -------
    list of dicts sorted by descending score:
        [{name, score, above_threshold}, ...]
    """
    candidates: list[tuple[str, float]] = []

    for name, embeddings in database.items():
        if embeddings:
            score = _aggregate_score(query, embeddings)
            candidates.append((name, score))

    candidates.sort(key=lambda t: t[1], reverse=True)

    return [
        {
            "name": name,
            "score": round(score, 4),
            "above_threshold": score >= threshold,
        }
        for name, score in candidates[:k]
    ]
