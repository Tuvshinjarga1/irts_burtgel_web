/* eslint-disable @typescript-eslint/no-explicit-any */

const FACE_API_CDN =
  "https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js";
const MODELS_URL =
  "https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights";

let loadPromise: Promise<any> | null = null;
let faceApiInstance: any = null;

export function getFaceApi(): any {
  return faceApiInstance;
}

export async function loadFaceApi(
  onProgress?: (stage: string) => void
): Promise<any> {
  if (faceApiInstance) return faceApiInstance;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    // Load the script from CDN
    onProgress?.("face-api.js ачаалж байна...");
    await new Promise<void>((resolve, reject) => {
      if ((window as any).faceapi) {
        resolve();
        return;
      }
      const script = document.createElement("script");
      script.src = FACE_API_CDN;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("face-api.js ачаалж чадсангүй"));
      document.head.appendChild(script);
    });

    const faceapi = (window as any).faceapi;
    if (!faceapi) throw new Error("face-api.js олдсонгүй");

    // Load required models
    onProgress?.("Нүүр таних загвар ачаалж байна...");
    await faceapi.nets.ssdMobilenetv1.loadFromUri(MODELS_URL);

    onProgress?.("Нүүрний цэг тодорхойлогч ачаалж байна...");
    await faceapi.nets.faceLandmark68Net.loadFromUri(MODELS_URL);

    onProgress?.("Нүүр танигч загвар ачаалж байна...");
    await faceapi.nets.faceRecognitionNet.loadFromUri(MODELS_URL);

    faceApiInstance = faceapi;
    onProgress?.("Бэлэн!");
    return faceapi;
  })();

  return loadPromise;
}
