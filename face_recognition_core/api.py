import os
import cv2
import numpy as np
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
import uuid
from typing import List

from detection import detect_faces
from alignment import align_face
from recognition import extract_features
from classification import FaceClassifier
from rl_agent import RLAgent

app = FastAPI(title="Face Recognition API")

# Allow Next.js frontend to talk to this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DATASET_DIR = "dataset"
MODEL_PATH = "svm_model.pkl"

# Itgeltseliin bosgo - SVM zoriulalt
CONFIDENCE_THRESHOLD = 0.6
# Cosine similarity bosgo - zurag tanitgal verification + 1 hun fallback
# 0.78+ bolson ued l tanitgana, ugui bol Unknown
COSINE_THRESHOLD = 0.78

# Ensure dataset directory exists
os.makedirs(DATASET_DIR, exist_ok=True)


class FaceProcessor:
    def __init__(self):
        self.classifier = FaceClassifier()
        self.rl_agent = RLAgent()
        # Load all stored embeddings into memory for cosine fallback
        self.known_embeddings: dict[str, List[np.ndarray]] = {}
        self._load_stored_embeddings()
        # Load SVM if exists
        if os.path.exists(MODEL_PATH):
            try:
                self.classifier.load_model(MODEL_PATH)
                print(f"Loaded SVM model from {MODEL_PATH}")
            except Exception as e:
                print(f"Could not load model: {e}")

    def _load_stored_embeddings(self):
        """Load all .npy embedding files from dataset/ into memory."""
        self.known_embeddings = {}
        if not os.path.exists(DATASET_DIR):
            return
        for person_name in os.listdir(DATASET_DIR):
            person_dir = os.path.join(DATASET_DIR, person_name)
            if not os.path.isdir(person_dir):
                continue
            embs = []
            for fname in os.listdir(person_dir):
                if fname.endswith(".npy"):
                    emb = np.load(os.path.join(person_dir, fname))
                    embs.append(emb)
            if embs:
                self.known_embeddings[person_name] = embs
                print(f"Loaded {len(embs)} embeddings for {person_name}")
        print(f"Total known people: {len(self.known_embeddings)}")

    def _cosine_predict_all(self, embedding: np.ndarray):
        """
        Returns sorted list of (person_name, cosine_similarity) for all known people.
        """
        if not self.known_embeddings:
            return []

        results = []
        emb_norm = embedding / (np.linalg.norm(embedding) + 1e-8)

        for person_name, emb_list in self.known_embeddings.items():
            sims = []
            for known_emb in emb_list:
                known_norm = known_emb / (np.linalg.norm(known_emb) + 1e-8)
                sim = float(np.dot(emb_norm, known_norm))
                sims.append(sim)
            # Use average of top-N similarities to be more robust
            sims.sort(reverse=True)
            avg_sim = sum(sims[:3]) / len(sims[:3])
            
            # --- REAL RL AGENT LOGIC (Contextual Bandit) ---
            # Agent queries Q-table to find optimal boost amount
            num_embs = len(emb_list)
            boost = self.rl_agent.get_action_boost(avg_sim, num_embs, exploring=False)
                
            dynamic_sim = avg_sim + boost
            # Cap at 0.99 to avoid artificial 100% values
            dynamic_sim = min(0.99, dynamic_sim)
            
            results.append((person_name, dynamic_sim))

        results.sort(key=lambda x: x[1], reverse=True)
        return results

    def _cosine_predict(self, embedding: np.ndarray):
        """Best cosine match. Returns (identity, confidence)."""
        ranked = self._cosine_predict_all(embedding)
        if not ranked:
            return "Unknown", 0.0
        best_person, best_sim = ranked[0]
        if best_sim >= COSINE_THRESHOLD:
            return best_person, best_sim
        return "Unknown", best_sim

    def process_image(self, img_array):
        faces = detect_faces(img_array)
        if not faces:
            return []

        raw_results = []
        for face_info in faces:
            landmarks = face_info['landmarks']
            bbox = face_info['facial_area']
            bbox = [int(x) for x in bbox]

            aligned_face = align_face(img_array, landmarks)
            embedding = extract_features(aligned_face)

            # === Classification Strategy ===
            # PRIMARY: Cosine similarity (measures actual embedding distance)
            # SECONDARY: SVM (used as tie-breaker when top-2 cosine scores are very close)
            
            ranked = self._cosine_predict_all(embedding)
            
            identity = "Unknown"
            confidence = 0.0
            
            if ranked:
                top_name, top_sim = ranked[0]
                
                if top_sim < COSINE_THRESHOLD:
                    # Not similar enough to anyone → Unknown
                    identity = "Unknown"
                    confidence = top_sim
                elif len(ranked) > 1:
                    second_name, second_sim = ranked[1]
                    # If top two are very close (within 5%), use SVM as tie-breaker
                    if (top_sim - second_sim) < 0.05 and self.classifier.is_trained:
                        svm_pred, svm_conf = self.classifier.predict(embedding)
                        identity = str(svm_pred)
                        confidence = float(svm_conf)
                    else:
                        # Top candidate is clearly better → use cosine result
                        identity = top_name
                        confidence = top_sim
                else:
                    identity = top_name
                    confidence = top_sim

            raw_results.append({
                "bbox": bbox,
                "identity": identity,
                "confidence": float(confidence),
                "embedding": embedding,  # temp for dedup
            })

        # === Deduplication ===
        # If the same person is claimed by multiple faces, keep only the BEST match
        identity_best: dict[str, int] = {}  # identity → index of best result
        for i, r in enumerate(raw_results):
            ident = r["identity"]
            if ident == "Unknown":
                continue
            if ident not in identity_best:
                identity_best[ident] = i
            else:
                prev_i = identity_best[ident]
                if r["confidence"] > raw_results[prev_i]["confidence"]:
                    # Demote the previous one
                    raw_results[prev_i]["identity"] = "Unknown"
                    identity_best[ident] = i
                else:
                    # Demote this one
                    raw_results[i]["identity"] = "Unknown"

        # Remove temp embedding from results before returning
        results = []
        for r in raw_results:
            results.append({
                "bbox": r["bbox"],
                "identity": r["identity"],
                "confidence": r["confidence"],
            })

        return results

    def add_face_to_dataset(self, img_array, bbox, name):
        """
        Saves the face crop image AND its embedding .npy file.
        Embedding is computed from the full-image detection, not the crop.
        """
        person_dir = os.path.join(DATASET_DIR, name)
        os.makedirs(person_dir, exist_ok=True)

        unique_id = uuid.uuid4().hex

        # 1. Detect face in full image near bbox to get landmarks
        #    Try to detect near the specified crop region
        x1, y1, x2, y2 = bbox

        # Add margin
        margin_x = int((x2 - x1) * 0.3)
        margin_y = int((y2 - y1) * 0.3)

        h, w = img_array.shape[:2]
        crop_y1 = max(0, y1 - margin_y)
        crop_y2 = min(h, y2 + margin_y)
        crop_x1 = max(0, x1 - margin_x)
        crop_x2 = min(w, x2 + margin_x)

        cropped_region = img_array[crop_y1:crop_y2, crop_x1:crop_x2]

        # 2. Detect face in the cropped region first
        embedding = None
        crop_faces = detect_faces(cropped_region)
        if crop_faces:
            landmarks = crop_faces[0]['landmarks']
            aligned_face = align_face(cropped_region, landmarks)
            embedding = extract_features(aligned_face)
            print(f"Extracted embedding from cropped region for {name}")
        else:
            # Fallback: run on full image and pick face closest to bbox center
            print(f"Could not detect in crop for {name}, trying full image...")
            full_faces = detect_faces(img_array)
            if full_faces:
                cx = (x1 + x2) / 2
                cy = (y1 + y2) / 2
                best_face = None
                best_dist = float('inf')
                for f in full_faces:
                    fa = f['facial_area']
                    fcx = (fa[0] + fa[2]) / 2
                    fcy = (fa[1] + fa[3]) / 2
                    dist = (fcx - cx) ** 2 + (fcy - cy) ** 2
                    if dist < best_dist:
                        best_dist = dist
                        best_face = f
                if best_face:
                    landmarks = best_face['landmarks']
                    aligned_face = align_face(img_array, landmarks)
                    embedding = extract_features(aligned_face)
                    print(f"Extracted embedding from full image for {name}")

        if embedding is None:
            print(f"ERROR: Failed to extract embedding for {name}")
            return None, "Embedding extraction failed"

        # --- RL Environment Feedback & Training ---
        # The user manually corrected/registered 'name', providing a Ground Truth reward signal!
        # We simulate the environment to update the Q-table by testing all known identities.
        for person_name, emb_list in self.known_embeddings.items():
            if not emb_list: continue
            
            sims = []
            for known_emb in emb_list:
                known_norm = known_emb / (np.linalg.norm(known_emb) + 1e-8)
                emb_norm = embedding / (np.linalg.norm(embedding) + 1e-8)
                sim = float(np.dot(emb_norm, known_norm))
                sims.append(sim)
                
            sims.sort(reverse=True)
            avg_sim = sum(sims[:3]) / len(sims[:3])
            num_embs = len(emb_list)
            
            # Environment Reward Source
            is_correct_person = (person_name == name)
            self.rl_agent.train_step(avg_sim, num_embs, is_correct_person, threshold=COSINE_THRESHOLD)
            
        print(f"RL Agent trained with user feedback for: {name}")

        # 3. Save the crop image
        img_path = os.path.join(person_dir, f"{unique_id}.jpg")
        cv2.imwrite(img_path, cropped_region)

        # 4. Save the embedding as .npy
        emb_path = os.path.join(person_dir, f"{unique_id}.npy")
        np.save(emb_path, embedding)

        # 5. Update in-memory known embeddings immediately
        if name not in self.known_embeddings:
            self.known_embeddings[name] = []
        self.known_embeddings[name].append(embedding)

        print(f"Saved {name}: image={img_path}, embedding={emb_path}")
        return img_path, None

    def retrain_model(self):
        """Retrains SVM using stored .npy embeddings. Much faster than re-detecting."""
        embeddings = []
        labels = []

        print("Retraining model from stored embeddings...")
        for person_name in os.listdir(DATASET_DIR):
            person_dir = os.path.join(DATASET_DIR, person_name)
            if not os.path.isdir(person_dir):
                continue

            count = 0
            for fname in os.listdir(person_dir):
                if fname.endswith(".npy"):
                    emb = np.load(os.path.join(person_dir, fname))
                    embeddings.append(emb)
                    labels.append(person_name)
                    count += 1

            print(f"  {person_name}: {count} embeddings")

        if not embeddings:
            print("No embeddings found, skipping training.")
            return

        unique_labels = list(set(labels))
        if len(unique_labels) < 2:
            print(f"Only {len(unique_labels)} person in dataset. Need 2+ for SVM. Using cosine similarity only.")
            # Delete stale model
            if os.path.exists(MODEL_PATH):
                os.remove(MODEL_PATH)
                self.classifier.is_trained = False
            return

        # Train SVM
        self.classifier.train(np.array(embeddings), np.array(labels))
        self.classifier.save_model(MODEL_PATH)
        print(f"SVM trained on {len(embeddings)} samples, {len(unique_labels)} people.")


processor = FaceProcessor()


@app.post("/recognize")
async def recognize_face(file: UploadFile = File(...)):
    contents = await file.read()
    nparr = np.frombuffer(contents, np.uint8)
    img_array = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if img_array is None:
        return {"error": "Invalid image"}

    results = processor.process_image(img_array)
    return {"results": results}


@app.post("/register")
async def register_face(file: UploadFile = File(...), name: str = Form(...), bbox: str = Form(...)):
    """
    bbox should be comma separated string like "x1,y1,x2,y2"
    """
    try:
        bbox_list = [int(x) for x in bbox.split(',')]
    except Exception:
        return {"error": "Invalid bounding box format (expected 'x1,y1,x2,y2')"}

    contents = await file.read()
    nparr = np.frombuffer(contents, np.uint8)
    img_array = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if img_array is None:
        return {"error": "Invalid image"}

    # Save face + embedding
    filepath, err = processor.add_face_to_dataset(img_array, bbox_list, name)
    if err:
        return {"error": err}

    # Retrain SVM if 2+ people available
    processor.retrain_model()

    return {
        "status": "success",
        "message": f"Successfully registered {name} and updated model.",
        "path": filepath
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api:app", host="0.0.0.0", port=8000, reload=True)
