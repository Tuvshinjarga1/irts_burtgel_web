import cv2
import numpy as np
import os
from detection import detect_faces
from alignment import align_face
from recognition import extract_features
from classification import verify_faces, FaceClassifier

class FaceRecognitionPipeline:
    def __init__(self, classifier_model_path=None):
        """
        Initialize the complete face recognition pipeline.
        If a classifier_model_path is provided, it will load the trained SVM.
        """
        self.classifier = FaceClassifier()
        if classifier_model_path and os.path.exists(classifier_model_path):
            self.classifier.load_model(classifier_model_path)
            print(f"Loaded classifier from {classifier_model_path}")

    def process_image(self, img_path):
        """
        Process an image: Detect -> Align -> Extract Features.
        Returns a list of dictionaries containing face geometries and embeddings.
        """
        print(f"Processing image: {img_path}")
        
        # 1. Detection
        faces = detect_faces(img_path)
        if not faces:
            print("No faces detected.")
            return []
            
        # We need the original image to crop and align
        img = cv2.imread(img_path)
        
        results = []
        # Process each detected face
        for face_info in faces:
            landmarks = face_info['landmarks']
            bbox = face_info['facial_area']
            
            # 2. Alignment
            # Aligns the face and crops it to 160x160 for FaceNet
            aligned_face = align_face(img, landmarks)
            
            # 3. Recognition / Feature Extraction
            embedding = extract_features(aligned_face)
            
            results.append({
                'bbox': bbox,
                'landmarks': landmarks,
                'aligned_face': aligned_face,
                'embedding': embedding
            })
            
        return results

    def verify(self, img_path1, img_path2, threshold=0.5):
        """
        Verify if the largest faces in two images belong to the same person.
        """
        results1 = self.process_image(img_path1)
        results2 = self.process_image(img_path2)
        
        if not results1 or not results2:
            return False, 0.0
            
        # Simple heuristic: take the first detected face (or you could sort by bbox area)
        emb1 = results1[0]['embedding']
        emb2 = results2[0]['embedding']
        
        # 4. Verification (Cosine Similarity)
        is_match, similarity = verify_faces(emb1, emb2, threshold=threshold)
        
        return is_match, similarity

    def train_classifier(self, dataset_dir, save_path="face_classifier.pkl"):
        """
        Train the SVM classifier on a dataset directory.
        Dataset structure should be:
        dataset_dir/
            person1/
                img1.jpg
                img2.jpg
            person2/
                img1.jpg...
        """
        embeddings = []
        labels = []
        
        for person_name in os.listdir(dataset_dir):
            person_dir = os.path.join(dataset_dir, person_name)
            if not os.path.isdir(person_dir):
                continue
                
            for img_name in os.listdir(person_dir):
                img_path = os.path.join(person_dir, img_name)
                
                # Extract features
                results = self.process_image(img_path)
                if results:
                    # Take the first face
                    embeddings.append(results[0]['embedding'])
                    labels.append(person_name)
                    
        if not embeddings:
            print("No faces found in the dataset.")
            return
            
        # 4. Train Classification (SVM)
        self.classifier.train(embeddings, labels)
        self.classifier.save_model(save_path)
        print(f"Model saved to {save_path}")

    def recognize(self, img_path):
        """
        Detect faces in an image and classify them using the trained SVM.
        """
        results = self.process_image(img_path)
        
        predictions = []
        for res in results:
            emb = res['embedding']
            
            # 4. Classification
            if self.classifier.is_trained:
                identity, confidence = self.classifier.predict(emb)
                predictions.append({
                    'bbox': res['bbox'],
                    'identity': identity,
                    'confidence': confidence
                })
            else:
                print("Classifier is not trained. Cannot recognize identity.")
                
        return predictions

# Usage Example:
if __name__ == "__main__":
    pipeline = FaceRecognitionPipeline()
    
    # 1. Verification Example
    # is_match, sim = pipeline.verify("path/to/img1.jpg", "path/to/img2.jpg")
    # print(f"Match: {is_match}, Similarity: {sim}")
    
    # 2. Classification Training Example
    # pipeline.train_classifier("path/to/dataset", "svm_model.pkl")
    
    # 3. Recognition Example
    # pipeline = FaceRecognitionPipeline("svm_model.pkl")
    # preds = pipeline.recognize("path/to/test_img.jpg")
    # print(preds)
    pass
