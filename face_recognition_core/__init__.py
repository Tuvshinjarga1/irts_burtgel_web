"""
__init__.py
───────────
Public API of the face_recognition_core package.
"""
from .detection  import detect
from .alignment  import align_faces
from .embedding  import embed, embed_batch
from .similarity import cosine_similarity, verify, find_best_match, find_top_k_matches
from .database   import FaceDatabase
from .rl_agent   import RLThresholdAgent
from .pipeline   import recognize, register, FaceResult, get_database, get_agent

__all__ = [
    # Stage 1 – Detection
    "detect",
    # Stage 2 – Alignment
    "align_faces",
    # Stage 3 – Feature extraction
    "embed",
    "embed_batch",
    # Stage 4 – Classification / Verification
    "cosine_similarity",
    "verify",
    "find_best_match",
    "find_top_k_matches",
    # Persistence
    "FaceDatabase",
    # RL
    "RLThresholdAgent",
    # Pipeline
    "recognize",
    "register",
    "FaceResult",
    "get_database",
    "get_agent",
]
