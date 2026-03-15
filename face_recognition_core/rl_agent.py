"""
rl_agent.py
───────────
Reinforcement Learning – Adaptive Threshold Agent.

Algorithm : Tabular Q-learning
State     : (confidence_bucket [0-4], db_size_bucket [0-4])  → 25 states
Actions   : 0 = lower threshold (−0.02)
            1 = keep threshold
            2 = raise threshold (+0.02)
Reward    : +1.0 correct recognition
            −1.0 wrong identification (false positive / false negative)
            +0.1 when a new face is successfully registered

The Q-table is persisted to `rl_qtable.json` so the agent keeps learning
across server restarts.
"""
from __future__ import annotations

import json
import logging
import random
from pathlib import Path

import numpy as np

logger = logging.getLogger(__name__)

_DEFAULT_QT_PATH = Path(__file__).parent / "rl_qtable.json"

# ──────────────────────────────────────────────────────────────────────────────
# Hyper-parameters
# ──────────────────────────────────────────────────────────────────────────────
N_STATES  = 25          # 5 conf-buckets × 5 db-buckets
N_ACTIONS = 3
ALPHA     = 0.1         # learning rate
GAMMA     = 0.9         # discount factor
EPSILON   = 0.1         # ε-greedy exploration

THRESHOLD_MIN  = 0.72    # FaceNet: different people in same demographic often score 0.65-0.85
THRESHOLD_MAX  = 0.92
THRESHOLD_INIT = 0.78    # conservative start; only lower via confirmed correct feedback
THRESHOLD_STEP = 0.01    # gradual steps only

# Bucket boundaries
_CONF_EDGES   = [0.0, 0.45, 0.55, 0.65, 0.75, 1.01]   # 5 buckets
_DBSZ_EDGES   = [0, 2, 5, 10, 20, int(1e9)]            # 5 buckets


def _conf_bucket(score: float) -> int:
    for i, edge in enumerate(_CONF_EDGES[1:], start=0):
        if score < edge:
            return i
    return 4


def _dbsz_bucket(db_size: int) -> int:
    for i, edge in enumerate(_DBSZ_EDGES[1:], start=0):
        if db_size < edge:
            return i
    return 4


def _state_index(conf_bucket: int, dbsz_bucket: int) -> int:
    return conf_bucket * 5 + dbsz_bucket


# ──────────────────────────────────────────────────────────────────────────────
# Agent
# ──────────────────────────────────────────────────────────────────────────────
class RLThresholdAgent:
    """Q-learning agent that adaptively sets the cosine-similarity threshold."""

    def __init__(self, path: str | Path = _DEFAULT_QT_PATH) -> None:
        self.path = Path(path)
        self.threshold = THRESHOLD_INIT
        self._q: np.ndarray = np.zeros((N_STATES, N_ACTIONS), dtype=np.float64)
        self._last_state: int | None = None
        self._last_action: int | None = None
        self._load()

    # ── Persistence ──────────────────────────────────────────────────────────

    def _load(self) -> None:
        if not self.path.exists():
            logger.info("No RL Q-table found – starting fresh (threshold=%.2f).", self.threshold)
            return
        try:
            with open(self.path, "r", encoding="utf-8") as fh:
                data = json.load(fh)
            self._q = np.array(data["q_table"], dtype=np.float64)
            self.threshold = float(data.get("threshold", THRESHOLD_INIT))
            self.threshold = max(THRESHOLD_MIN, min(THRESHOLD_MAX, self.threshold))
            logger.info("RL agent loaded – threshold=%.3f", self.threshold)
        except Exception as exc:
            logger.warning("Could not load RL Q-table: %s", exc)

    def save(self) -> None:
        try:
            with open(self.path, "w", encoding="utf-8") as fh:
                json.dump(
                    {"q_table": self._q.tolist(), "threshold": self.threshold},
                    fh,
                    indent=2,
                )
        except Exception as exc:
            logger.error("Failed to save RL Q-table: %s", exc)

    # ── Core RL interface ────────────────────────────────────────────────────

    def choose_action(self, confidence: float, db_size: int) -> int:
        """Choose action (ε-greedy).  Stores state for future update."""
        cb = _conf_bucket(confidence)
        db = _dbsz_bucket(db_size)
        s  = _state_index(cb, db)

        if random.random() < EPSILON:
            action = random.randint(0, N_ACTIONS - 1)
        else:
            action = int(np.argmax(self._q[s]))

        self._last_state  = s
        self._last_action = action
        return action

    def apply_action(self, action: int) -> float:
        """Apply action to threshold and return new threshold value."""
        if action == 0:
            self.threshold = max(THRESHOLD_MIN, self.threshold - THRESHOLD_STEP)
        elif action == 2:
            self.threshold = min(THRESHOLD_MAX, self.threshold + THRESHOLD_STEP)
        # action == 1 → keep
        return self.threshold

    def update(self, reward: float, next_confidence: float, next_db_size: int) -> None:
        """TD update after receiving reward."""
        if self._last_state is None or self._last_action is None:
            return
        cb = _conf_bucket(next_confidence)
        db = _dbsz_bucket(next_db_size)
        s_next = _state_index(cb, db)

        td_target = reward + GAMMA * np.max(self._q[s_next])
        td_error  = td_target - self._q[self._last_state, self._last_action]
        self._q[self._last_state, self._last_action] += ALPHA * td_error
        self.save()

    # ── Convenience wrappers used by pipeline ────────────────────────────────

    def step(self, confidence: float, db_size: int) -> float:
        """Choose action, apply it, and return updated threshold (no reward yet)."""
        action = self.choose_action(confidence, db_size)
        return self.apply_action(action)

    def reward_correct(self, confidence: float, db_size: int) -> None:
        """Call after a recognition is confirmed correct (+1 reward)."""
        self.update(+1.0, confidence, db_size)

    def reward_wrong(self, confidence: float, db_size: int) -> None:
        """Call after a mis-identification is reported (−1 reward)."""
        self.update(-1.0, confidence, db_size)

    def reward_register(self, db_size: int) -> None:
        """Small positive reward when a new face is registered."""
        self.update(+0.1, self.threshold, db_size)

    # ── Introspection ────────────────────────────────────────────────────────

    def info(self) -> dict:
        return {
            "threshold": self.threshold,
            "q_table_shape": list(self._q.shape),
            "q_table_max":   float(self._q.max()),
            "q_table_min":   float(self._q.min()),
        }
