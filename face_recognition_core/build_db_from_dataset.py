"""
build_db_from_dataset.py
─────────────────────────
Dataset JSON-аас бүх хүний олон өнцгийн зурагнуудыг татаж
face_db.json-д embeddings бичих standalone скрипт.

Ажиллуулах:
    cd "C:\\Users\\hp\\Desktop\\KH DIPLOM HUN AIMR\\irts_burtgel_web\\face_recognition_core"
    python build_db_from_dataset.py

Optional arguments:
    --dataset   JSON файлын зам (default: DS/face_datasets_2026-04-05.json)
    --clear     Одоогийн face_db.json-г цэвэрлэх (fresh start)
    --students  DS/students of class/ хавтасны зургуудыг ч нэмэх
"""
from __future__ import annotations

import argparse
import json
import logging
import sys
import time
from pathlib import Path

import cv2
import numpy as np
import requests

# ── Ensure face_recognition_core is importable ────────────────────────────────
_THIS_DIR = Path(__file__).resolve().parent
if str(_THIS_DIR) not in sys.path:
    sys.path.insert(0, str(_THIS_DIR))

from database  import FaceDatabase
from pipeline  import register

# ── Logging setup ─────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

# ── Paths ─────────────────────────────────────────────────────────────────────
_DATASET_DIR   = _THIS_DIR.parent.parent / "DS"
_DEFAULT_JSON  = _DATASET_DIR / "face_datasets_2026-04-05.json"
_STUDENTS_DIR  = _DATASET_DIR / "students of class"


# ──────────────────────────────────────────────────────────────────────────────
# Core helpers
# ──────────────────────────────────────────────────────────────────────────────
# _embed_image was removed. Used pipeline.register natively.

def _register_from_url(
    db: FaceDatabase,
    name: str,
    image_url: str,
    angle: str,
    retries: int = 2,
) -> bool:
    """Download an image and register the first detected face under *name*."""
    for attempt in range(1, retries + 1):
        try:
            resp = requests.get(image_url, timeout=20)
            resp.raise_for_status()
            arr   = np.frombuffer(resp.content, dtype=np.uint8)
            image = cv2.imdecode(arr, cv2.IMREAD_COLOR)
            if image is None:
                logger.warning("  ✗ Could not decode image for %s [%s]", name, angle)
                return False

            db_size_before = db.count_embeddings()
            ok = register(image, name)
            if not ok:
                logger.warning("  ✗ No face detected for %s [%s]", name, angle)
                return False

            logger.info("  ✓ %-20s  [%-15s]  (total embeddings: %d)",
                        name, angle, db.count_embeddings() - db_size_before + len(db._store.get(name, [])))
            return True

        except requests.exceptions.RequestException as exc:
            if attempt < retries:
                logger.warning("  ! Retry %d/%d for %s [%s]: %s", attempt, retries, name, angle, exc)
                time.sleep(1.5)
            else:
                logger.error("  ✗ FAILED %s [%s]: %s", name, angle, exc)
                return False
        except Exception as exc:
            logger.error("  ✗ ERROR %s [%s]: %s", name, angle, exc)
            return False
    return False


def _register_from_file(
    db: FaceDatabase,
    name: str,
    image_path: Path,
) -> bool:
    """Register all detected faces in a local image file."""
    image = cv2.imread(str(image_path))
    if image is None:
        logger.warning("  ✗ Cannot read file: %s", image_path)
        return False

    db_size_before = db.count_embeddings()
    ok = register(image, name)
    if not ok:
        logger.warning("  ✗ No faces detected in: %s", image_path.name)
        return False
        
    registered = db.count_embeddings() - db_size_before

    logger.info("  ✓ %-20s  [file: %-30s]  %d face(s) added", name, image_path.name, registered)
    return True


# ──────────────────────────────────────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────────────────────────────────────
def main() -> None:
    parser = argparse.ArgumentParser(description="Bulk enroll faces from dataset JSON")
    parser.add_argument("--dataset",  default=str(_DEFAULT_JSON), help="Path to dataset JSON")
    parser.add_argument("--clear",    action="store_true",        help="Clear existing DB first")
    parser.add_argument("--students", action="store_true",        help="Also enroll students-of-class images")
    parser.add_argument("--name",     default="",                 help="Name for students-of-class images (required if --students)")
    args = parser.parse_args()

    # ── Load / clear DB ──────────────────────────────────────────────────────
    db = FaceDatabase()
    if args.clear:
        logger.info("🗑  Clearing existing database…")
        db._store.clear()
        db.save()

    existing_count = db.count_embeddings()
    logger.info("📂 Database loaded — %d existing embeddings for %d identities.",
                existing_count, len(db))

    # ── 1) Enroll from JSON ───────────────────────────────────────────────────
    dataset_path = Path(args.dataset)
    if not dataset_path.exists():
        logger.error("Dataset JSON not found: %s", dataset_path)
        sys.exit(1)

    with open(dataset_path, "r", encoding="utf-8") as f:
        records = json.load(f)

    logger.info("=" * 60)
    logger.info("📋 Dataset: %s", dataset_path.name)
    logger.info("   Total records: %d", len(records))
    logger.info("=" * 60)

    # Determine angle priority: front first, then others
    _ANGLE_PRIORITY = {"front": 0, "left_profile": 1, "right_profile": 2, "looking_up": 3}

    # Group by userName
    from collections import defaultdict
    by_user: dict[str, list[dict]] = defaultdict(list)
    for rec in records:
        name = rec.get("userName", "").strip()
        if name:
            by_user[name].append(rec)

    total_ok      = 0
    total_failed  = 0
    total_skipped = 0

    for name, recs in by_user.items():
        logger.info("👤 Enrolling: %s  (%d images)", name, len(recs))

        # Sort by angle priority
        sorted_recs = sorted(recs, key=lambda r: _ANGLE_PRIORITY.get(r.get("angleLabel", ""), 9))

        for rec in sorted_recs:
            angle     = rec.get("angleLabel", "unknown")
            image_url = rec.get("imageUrl", "").strip()
            if not image_url:
                total_skipped += 1
                continue
            # Skip duplicate: if person already has >= 6 embeddings, skip looking_up
            # (to avoid over-representing angles that look too different)
            current_count = len(db._store.get(name, []))
            if current_count >= 6 and angle == "looking_up":
                logger.debug("  ~ Skipping looking_up (already %d embeddings) for %s", current_count, name)
                total_skipped += 1
                continue

            ok = _register_from_url(db, name, image_url, angle)
            if ok:
                total_ok += 1
            else:
                total_failed += 1

    # ── 2) Enroll from students-of-class folder (optional) ───────────────────
    if args.students:
        if not _STUDENTS_DIR.exists():
            logger.warning("students of class directory not found: %s", _STUDENTS_DIR)
        else:
            student_name = args.name.strip() or "Student"
            images = list(_STUDENTS_DIR.glob("*.jpg")) + \
                     list(_STUDENTS_DIR.glob("*.jpeg")) + \
                     list(_STUDENTS_DIR.glob("*.png"))
            logger.info("=" * 60)
            logger.info("🏫 students of class: %d images → name='%s'", len(images), student_name)
            logger.info("=" * 60)
            for img_path in sorted(images):
                ok = _register_from_file(db, student_name, img_path)
                if ok:
                    total_ok += 1
                else:
                    total_failed += 1

    # ── Summary ───────────────────────────────────────────────────────────────
    logger.info("")
    logger.info("=" * 60)
    logger.info("✅ DONE")
    logger.info("   Enrolled:  %d", total_ok)
    logger.info("   Failed:    %d", total_failed)
    logger.info("   Skipped:   %d", total_skipped)
    logger.info("   DB size:   %d identities, %d total embeddings",
                len(db), db.count_embeddings())
    logger.info("=" * 60)

    # Print per-identity summary
    logger.info("\nPer-identity embedding count:")
    for iname, embs in sorted(db._store.items()):
        logger.info("  %-25s  %d embedding(s)", iname, len(embs))


if __name__ == "__main__":
    main()
