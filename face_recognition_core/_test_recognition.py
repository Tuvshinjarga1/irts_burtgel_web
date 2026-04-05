import sys, os
os.environ["PYTHONUTF8"] = "1"
sys.path.insert(0, ".")
import cv2
from pipeline import recognize

IMAGE_PATHS = [
    r"C:\Users\hp\Desktop\KH DIPLOM HUN AIMR\DS\students of class\IMG_4988.jpeg",
    r"C:\Users\hp\Desktop\KH DIPLOM HUN AIMR\DS\students of class\IMG_4989.jpeg",
    r"C:\Users\hp\Desktop\KH DIPLOM HUN AIMR\DS\students of class\IMG_4990.jpeg",
]

with open("test_results.txt", "w", encoding="utf-8") as f:
    for img_path in IMAGE_PATHS:
        image = cv2.imread(img_path)
        if image is None:
            f.write(f"ERROR: Cannot read {img_path}\n")
            continue

        fname = os.path.basename(img_path)
        f.write(f"\n{'='*55}\n")
        f.write(f"  Image: {fname}  [{image.shape[1]}x{image.shape[0]}]\n")
        f.write(f"{'='*55}\n")

        results = recognize(image)
        f.write(f"  Faces found: {len(results)}\n")
        for i, r in enumerate(results):
            d = r.to_dict()
            known = d["identity"] != "Unknown"
            icon  = "[OK]" if known else "[??]"
            f.write(f"  {icon} Face {i+1:>2}: {d['identity']:<22}  conf={d['confidence']:.4f}  det={d['det_score']:.3f}\n")
            topk = [(x["name"], round(x["score"], 3)) for x in d["top_k"]]
            f.write(f"         top-k: {topk}\n")

    f.write("\nDone.\n")
print("Results written to test_results.txt")
