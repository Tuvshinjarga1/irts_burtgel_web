import numpy as np
import cv2
from keras_facenet import FaceNet

# Initialize FaceNet model globally so it's only loaded once
embedder = FaceNet()

def extract_features(aligned_face):
    """
    Extract 512-dimensional embedding using FaceNet.
    """
    # Facenet expects RGB format
    face_rgb = cv2.cvtColor(aligned_face, cv2.COLOR_BGR2RGB)
    
    # Expand dims to represent batch size of 1: (1, 160, 160, 3)
    face_input = np.expand_dims(face_rgb, axis=0)
    
    # Get embeddings
    embeddings = embedder.embeddings(face_input)
    
    return embeddings[0] # Return the 1D embedding array

