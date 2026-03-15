"""
similarity.py
─────────────
Stage 4a – Cosine Similarity & Best-Match (Classification / Verification).

Two roles:
  1. VERIFICATION  – given two embeddings, return their cosine similarity score.
  2. CLASSIFICATION – given a query embedding and a database, return the best
                      matching identity (or "Unknown") and the similarity score.
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
    threshold : minimum cosine similarity to accept a match.

    Returns
    -------
    (identity, score)
        identity = "Unknown" if no match exceeds the threshold.
        score    = best cosine similarity found (0.0 if db is empty).
    """
    best_name  = "Unknown"
    best_score = 0.0

    for name, embeddings in database.items():
        for ref in embeddings:
            score = cosine_similarity(query, ref)
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

    Useful for re-ranking or confidence display.

    Returns
    -------
    list of dicts sorted by descending score:
        [{name, score, above_threshold}, ...]
    """
    candidates: list[tuple[str, float]] = []

    for name, embeddings in database.items():
        if embeddings:
            # representative score = max similarity across all stored embeddings
            best = max(cosine_similarity(query, ref) for ref in embeddings)
            candidates.append((name, best))

    candidates.sort(key=lambda t: t[1], reverse=True)

    return [
        {
            "name": name,
            "score": score,
            "above_threshold": score >= threshold,
        }
        for name, score in candidates[:k]
    ]
