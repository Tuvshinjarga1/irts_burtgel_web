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
import logging
from typing import Optional

import cv2
import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
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
# Entry point
# ──────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api:app", host="0.0.0.0", port=8000, reload=True)
