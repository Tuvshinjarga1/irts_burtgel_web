import numpy as np
from sklearn.svm import SVC
import pickle


class FaceClassifier:
    """
    SVM Classifier to classify a face embedding into known identities.
    Cosine similarity is handled in api.py as a fallback.
    """
    def __init__(self):
        self.model = SVC(kernel='rbf', probability=True, C=10.0, gamma='scale')
        self.is_trained = False

    def train(self, embeddings, labels):
        """Train the SVM model on a list of embeddings and labels."""
        # Normalize embeddings before training
        norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
        embeddings_norm = embeddings / (norms + 1e-8)

        self.model.fit(embeddings_norm, labels)
        self.is_trained = True
        print("SVM model trained successfully.")

    def predict(self, embedding):
        """
        Predict the identity of a given face embedding.
        Returns (identity, confidence)
        """
        if not self.is_trained:
            raise ValueError("Model is not trained yet.")

        # Normalize
        norm = np.linalg.norm(embedding)
        emb_norm = embedding / (norm + 1e-8)
        emb = np.expand_dims(emb_norm, axis=0)

        prediction = self.model.predict(emb)[0]
        probas = self.model.predict_proba(emb)[0]
        confidence = float(np.max(probas))

        return prediction, confidence

    def save_model(self, filepath):
        with open(filepath, 'wb') as f:
            pickle.dump({'model': self.model, 'is_trained': self.is_trained}, f)

    def load_model(self, filepath):
        with open(filepath, 'rb') as f:
            data = pickle.load(f)
            self.model = data['model']
            self.is_trained = data['is_trained']
