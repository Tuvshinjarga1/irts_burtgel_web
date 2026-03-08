import cv2
from retinaface import RetinaFace

def detect_faces(img_path_or_array):
    """
    Detects faces in an image using RetinaFace.
    Returns: a list of faces with their bounding boxes and landmarks.
    """
    # If a string is passed, it reads the image. So it accepts both
    # BGR numpy array or string path. Be careful: cv2 reads in BGR.
    # RetinaFace expects RGB. We should handle it properly.
    if isinstance(img_path_or_array, str):
        img = cv2.imread(img_path_or_array)
        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    else:
        # Assuming the array is already BGR since OpenCV is standard
        img = img_path_or_array
        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

    try:
        # returns a dictionary like {'face_1': {'score': ..., 'facial_area': ...}, ...}
        detections = RetinaFace.detect_faces(img_rgb)
    except Exception as e:
        print(f"Error detection: {e}")
        return []

    faces = []
    if type(detections) is dict:
        for key, face_info in detections.items():
            faces.append(face_info)
    
    return faces # list of dicts with 'facial_area', 'landmarks', 'score'
