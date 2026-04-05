"""
api.py
──────
FastAPI server for the face recognition pipeline.

Endpoints:
  POST /recognize   – multipart image → [{bbox, identity, confidence, …}]
  POST /register    – image + name + bbox  → register face
  POST /feedback    – {correct, confidence} → RL reward
  GET  /identities  – list of registered names
  GET  /health      – server status + current threshold
  DELETE /identity/{name} – remove an identity
"""
from __future__ import annotations

import io
import json
import logging
import threading
from pathlib import Path
from typing import Optional

import cv2
import numpy as np
import requests as _requests
from fastapi import FastAPI, File, Form, HTTPException, UploadFile, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from pipeline import get_agent, get_database, recognize, register

# ──────────────────────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Face Recognition API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ──────────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────────
async def _read_image(file: UploadFile) -> np.ndarray:
    contents = await file.read()
    arr = np.frombuffer(contents, dtype=np.uint8)
    image = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if image is None:
        raise HTTPException(status_code=400, detail="Invalid image file.")
    return image


# ──────────────────────────────────────────────────────────────────────────────
# POST /recognize
# ──────────────────────────────────────────────────────────────────────────────
@app.post("/recognize")
async def recognize_endpoint(file: UploadFile = File(...)):
    """Detect, align, embed, and classify all faces in the uploaded image."""
    image = await _read_image(file)
    results = recognize(image)
    agent   = get_agent()
    return {
        "results":   [r.to_dict() for r in results],
        "threshold": round(agent.threshold, 4),
        "count":     len(results),
    }


# ──────────────────────────────────────────────────────────────────────────────
# POST /register
# ──────────────────────────────────────────────────────────────────────────────
@app.post("/register")
async def register_endpoint(
    file: UploadFile = File(...),
    name: str = Form(...),
    x1: Optional[int] = Form(None),
    y1: Optional[int] = Form(None),
    x2: Optional[int] = Form(None),
    y2: Optional[int] = Form(None),
):
    """Register a face from the uploaded image under *name*."""
    image = await _read_image(file)
    bbox  = [x1, y1, x2, y2] if all(v is not None for v in [x1, y1, x2, y2]) else None

    ok = register(image, name, bbox)
    if not ok:
        raise HTTPException(status_code=422, detail="No face could be detected / registered.")

    db = get_database()
    return {
        "message":    f"'{name}' registered successfully.",
        "db_size":    len(db),
        "identities": db.identities(),
    }


# ──────────────────────────────────────────────────────────────────────────────
# POST /feedback  (RL reward signal)
# ──────────────────────────────────────────────────────────────────────────────
class FeedbackRequest(BaseModel):
    correct:    bool
    confidence: float = 0.5


@app.post("/feedback")
async def feedback_endpoint(body: FeedbackRequest):
    """Send a correctness signal to the RL agent."""
    agent = get_agent()
    db    = get_database()

    if body.correct:
        agent.reward_correct(body.confidence, len(db))
    else:
        agent.reward_wrong(body.confidence, len(db))

    return {
        "message":   "Feedback received.",
        "threshold": round(agent.threshold, 4),
        "rl_info":   agent.info(),
    }


# ──────────────────────────────────────────────────────────────────────────────
# GET /identities
# ──────────────────────────────────────────────────────────────────────────────
@app.get("/identities")
async def identities_endpoint():
    """Return list of all registered identity names."""
    db = get_database()
    return {
        "identities":       db.identities(),
        "total_embeddings": db.count_embeddings(),
    }


# ──────────────────────────────────────────────────────────────────────────────
# DELETE /identity/{name}
# ──────────────────────────────────────────────────────────────────────────────
@app.delete("/identity/{name}")
async def delete_identity(name: str):
    """Remove all embeddings for *name* from the database."""
    db = get_database()
    found = db.remove(name)
    if not found:
        raise HTTPException(status_code=404, detail=f"Identity '{name}' not found.")
    return {"message": f"Identity '{name}' removed.", "db_size": len(db)}


# ──────────────────────────────────────────────────────────────────────────────
# GET /health
# ──────────────────────────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    agent = get_agent()
    db    = get_database()
    return {
        "status":     "ok",
        "threshold":  round(agent.threshold, 4),
        "identities": len(db),
        "embeddings": db.count_embeddings(),
        "rl_info":    agent.info(),
    }


# ──────────────────────────────────────────────────────────────────────────────
# POST /enroll-dataset  — bulk enroll from JSON dataset
# ──────────────────────────────────────────────────────────────────────────────
_enroll_status: dict = {"running": False, "done": 0, "failed": 0, "total": 0, "log": []}


def _run_enroll(dataset_path: str) -> None:
    """Background task: download images from dataset JSON and register faces."""
    global _enroll_status
    _enroll_status["running"] = True
    _enroll_status["done"]    = 0
    _enroll_status["failed"]  = 0
    _enroll_status["log"]     = []

    try:
        with open(dataset_path, "r", encoding="utf-8") as f:
            records = json.load(f)
    except Exception as exc:
        _enroll_status["running"] = False
        _enroll_status["log"].append(f"ERROR reading dataset: {exc}")
        return

    _enroll_status["total"] = len(records)
    db = get_database()

    for rec in records:
        name      = rec.get("userName", "").strip()
        image_url = rec.get("imageUrl", "").strip()
        angle     = rec.get("angleLabel", "")

        if not name or not image_url:
            _enroll_status["failed"] += 1
            continue

        try:
            resp = _requests.get(image_url, timeout=15)
            resp.raise_for_status()
            arr   = np.frombuffer(resp.content, dtype=np.uint8)
            image = cv2.imdecode(arr, cv2.IMREAD_COLOR)
            if image is None:
                raise ValueError("cv2.imdecode returned None")

            ok = register(image, name)
            if ok:
                _enroll_status["done"] += 1
                _enroll_status["log"].append(f"OK  [{angle}] {name}")
            else:
                _enroll_status["failed"] += 1
                _enroll_status["log"].append(f"SKIP (no face) [{angle}] {name}")
        except Exception as exc:
            _enroll_status["failed"] += 1
            _enroll_status["log"].append(f"ERR [{angle}] {name}: {exc}")

    _enroll_status["running"] = False
    logger.info(
        "Enroll done: %d enrolled, %d failed out of %d records.",
        _enroll_status["done"],
        _enroll_status["failed"],
        _enroll_status["total"],
    )


@app.post("/enroll-dataset")
async def enroll_dataset(
    background_tasks: BackgroundTasks,
    dataset_path: str = Form(
        default=r"C:\Users\hp\Desktop\KH DIPLOM HUN AIMR\DS\face_datasets_2026-04-05.json"
    ),
):
    """Bulk-enroll all faces from a local dataset JSON file.

    The JSON must be a list of objects with fields:
        userName  : str   — identity name
        imageUrl  : str   — public image URL
        angleLabel: str   — optional, for logging only

    Processing runs in the background; poll /enroll-status for progress.
    """
    if _enroll_status["running"]:
        raise HTTPException(status_code=409, detail="Enroll already running.")
    if not Path(dataset_path).exists():
        raise HTTPException(status_code=404, detail=f"Dataset not found: {dataset_path}")

    background_tasks.add_task(_run_enroll, dataset_path)
    return {"message": "Bulk enroll started in background.", "poll": "/enroll-status"}


@app.get("/enroll-status")
async def enroll_status():
    """Return current bulk-enroll progress."""
    return _enroll_status


# ──────────────────────────────────────────────────────────────────────────────
# Entry point
# ──────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api:app", host="0.0.0.0", port=8000, reload=True)
