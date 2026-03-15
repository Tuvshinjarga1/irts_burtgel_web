"""
embedding.py
────────────
Stage 3 – Feature Extraction (Embedding).

Converts a 112×112 BGR aligned face chip into a 512-dimensional
L2-normalised embedding vector using FaceNet (InceptionResnetV1,
pretrained on VGGFace2).

The model is lazily loaded on first use (singleton pattern) so the
import of this module is cheap.
"""
from __future__ import annotations

import logging
from functools import lru_cache

import cv2
import numpy as np
import torch

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────────────────────────────────────
# Device
# ──────────────────────────────────────────────────────────────────────────────
_DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")
logger.info("Embedding device: %s", _DEVICE)

# ──────────────────────────────────────────────────────────────────────────────
# Model (lazy singleton)
# ──────────────────────────────────────────────────────────────────────────────
_model: "torch.nn.Module | None" = None


def _get_model() -> "torch.nn.Module":
    global _model
    if _model is None:
        try:
            from facenet_pytorch import InceptionResnetV1  # type: ignore[import]

            logger.info("Loading FaceNet InceptionResnetV1 (vggface2)…")
            _model = InceptionResnetV1(pretrained="vggface2").eval().to(_DEVICE)
            logger.info("FaceNet loaded.")
        except ImportError as exc:
            raise RuntimeError(
                "facenet-pytorch is not installed. "
                "Run: pip install facenet-pytorch"
            ) from exc
    return _model


# ──────────────────────────────────────────────────────────────────────────────
# Pre-processing
# ──────────────────────────────────────────────────────────────────────────────
_MEAN = np.array([127.5, 127.5, 127.5], dtype=np.float32)
_STD  = np.array([128.0, 128.0, 128.0], dtype=np.float32)


def _chip_to_tensor(chip_bgr: np.ndarray) -> torch.Tensor:
    """Convert a (112, 112, 3) BGR uint8 chip to a (1, 3, 160, 160) float tensor."""
    # BGR → RGB
    rgb = cv2.cvtColor(chip_bgr, cv2.COLOR_BGR2RGB)
    # resize to 160×160 (FaceNet's expected input)
    rgb = cv2.resize(rgb, (160, 160), interpolation=cv2.INTER_LINEAR)
    # Normalize to [-1, 1]
    arr = (rgb.astype(np.float32) - _MEAN) / _STD
    # HWC → CHW → NCHW
    tensor = torch.from_numpy(arr).permute(2, 0, 1).unsqueeze(0).to(_DEVICE)
    return tensor


# ──────────────────────────────────────────────────────────────────────────────
# Public API
# ──────────────────────────────────────────────────────────────────────────────
def embed(chip_bgr: np.ndarray) -> np.ndarray:
    """Return a 512-D L2-normalised embedding for one aligned face chip.

    Parameters
    ----------
    chip_bgr : (112, 112, 3) uint8 BGR aligned face chip.

    Returns
    -------
    embedding : np.ndarray, shape (512,), dtype float32, L2-normalised.
    """
    return embed_batch([chip_bgr])[0]


def embed_batch(chips_bgr: list[np.ndarray]) -> list[np.ndarray]:
    """Embed a list of aligned face chips in one forward pass.

    Parameters
    ----------
    chips_bgr : list of (112, 112, 3) uint8 BGR chips.

    Returns
    -------
    embeddings : list of np.ndarray, each shape (512,), L2-normalised.
    """
    if not chips_bgr:
        return []

    model = _get_model()

    tensors = [_chip_to_tensor(chip) for chip in chips_bgr]
    batch = torch.cat(tensors, dim=0)  # (N, 3, 160, 160)

    with torch.no_grad():
        vecs: torch.Tensor = model(batch)  # (N, 512)

    # L2-normalise
    norms = vecs.norm(dim=1, keepdim=True).clamp(min=1e-8)
    vecs = vecs / norms

    return [vecs[i].cpu().numpy().astype(np.float32) for i in range(len(chips_bgr))]
