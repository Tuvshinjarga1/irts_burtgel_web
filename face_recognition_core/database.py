"""
database.py
───────────
JSON-backed face database.

Schema of face_db.json:
    {
        "<name>": [
            [<float>, …]   # 512-D embedding
        ],
        …
    }
"""
from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Iterator

import numpy as np

logger = logging.getLogger(__name__)

_DEFAULT_DB_PATH = Path(__file__).parent / "face_db.json"


class FaceDatabase:
    """Persist face embeddings keyed by identity name."""

    def __init__(self, path: str | Path = _DEFAULT_DB_PATH) -> None:
        self.path = Path(path)
        # name → list of np.ndarray (512,)
        self._store: dict[str, list[np.ndarray]] = {}
        self.load()

    # ── Persistence ──────────────────────────────────────────────────────────

    def load(self) -> None:
        """Load embeddings from disk (silently ignores missing file)."""
        if not self.path.exists():
            logger.info("No face database found at %s – starting empty.", self.path)
            return
        try:
            with open(self.path, "r", encoding="utf-8") as fh:
                raw: dict[str, list[list[float]]] = json.load(fh)
            self._store = {
                name: [np.array(e, dtype=np.float32) for e in embeddings]
                for name, embeddings in raw.items()
            }
            total = sum(len(v) for v in self._store.values())
            logger.info("Loaded %d embeddings for %d identities.", total, len(self._store))
        except Exception as exc:
            logger.error("Failed to load database: %s", exc)

    def save(self) -> None:
        """Persist embeddings to disk."""
        try:
            raw = {
                name: [emb.tolist() for emb in embeddings]
                for name, embeddings in self._store.items()
            }
            with open(self.path, "w", encoding="utf-8") as fh:
                json.dump(raw, fh, ensure_ascii=False, indent=2)
            logger.debug("Database saved → %s", self.path)
        except Exception as exc:
            logger.error("Failed to save database: %s", exc)

    # ── CRUD ─────────────────────────────────────────────────────────────────

    def add(self, name: str, embedding: np.ndarray) -> int:
        """Add one embedding for *name*.

        Returns
        -------
        int  – total number of embeddings stored for *name* after this call.
        """
        name = name.strip()
        if not name:
            raise ValueError("Name must not be empty.")
        if name not in self._store:
            self._store[name] = []
        self._store[name].append(embedding.astype(np.float32))
        self.save()
        return len(self._store[name])

    def remove(self, name: str) -> bool:
        """Delete all embeddings for *name*.  Returns True if found."""
        if name in self._store:
            del self._store[name]
            self.save()
            return True
        return False

    def query(
        self,
        embedding: np.ndarray,
        threshold: float = 0.55,
    ) -> tuple[str, float]:
        """Find the closest identity to *embedding*.

        Returns
        -------
        (identity, score)
             identity = "Unknown" when no match exceeds *threshold*.
        """
        from similarity import find_best_match  # local import to avoid circularity

        return find_best_match(embedding, self._store, threshold)

    # ── Iteration helpers ────────────────────────────────────────────────────

    def identities(self) -> list[str]:
        return list(self._store.keys())

    def __len__(self) -> int:
        return len(self._store)

    def __iter__(self) -> Iterator[tuple[str, list[np.ndarray]]]:
        return iter(self._store.items())

    def items(self) -> dict[str, list[np.ndarray]]:
        """Return raw store (read-only view for similarity search)."""
        return self._store

    def count_embeddings(self) -> int:
        return sum(len(v) for v in self._store.values())
