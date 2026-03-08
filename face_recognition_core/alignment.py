import cv2
import numpy as np

# InsightFace standard reference landmarks for 112x112 image
REFERENCE_FACIAL_POINTS = np.array([
    [38.2946, 51.6963],
    [73.5318, 51.5014],
    [56.0252, 71.7366],
    [41.5493, 92.3655],
    [70.7299, 92.2041]
], dtype=np.float32)

def align_face(img, landmarks, output_size=(160, 160)):
    """
    Align face based on 5 facial landmarks using Affine Transform.
    """
    if isinstance(landmarks, dict):
        # Extract from retinaface dict format
        # retinaface format: {'left_eye': [], 'right_eye': [], 'nose': [], 'mouth_left': [], 'mouth_right': []}
        src = np.array([
            landmarks['left_eye'],
            landmarks['right_eye'],
            landmarks['nose'],
            landmarks['mouth_left'],
            landmarks['mouth_right']
        ], dtype=np.float32)
    else:
        src = np.array(landmarks, dtype=np.float32)

    # Scale standard points to target output size (e.g. 160x160 for Facenet)
    # The standard points are for 112x112
    scale_x = output_size[0] / 112.0
    scale_y = output_size[1] / 112.0
    
    dst = REFERENCE_FACIAL_POINTS.copy()
    dst[:, 0] *= scale_x
    dst[:, 1] *= scale_y

    # Calculate affine transform matrix
    M, _ = cv2.estimateAffinePartial2D(src, dst)

    # Warp the image
    aligned_face = cv2.warpAffine(img, M, output_size)

    return aligned_face

