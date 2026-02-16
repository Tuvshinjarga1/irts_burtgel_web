/* eslint-disable @typescript-eslint/no-explicit-any */

import { getFaceApi } from "./face-api-loader";
import { getStudents, type Student } from "./storage";

export interface DetectedFace {
  detection: any;
  descriptor: Float32Array;
  landmarks: any;
}

export interface RecognitionResult {
  face: DetectedFace;
  student: Student | null;
  distance: number;
  label: string;
}

/**
 * Detect all faces in an image/canvas element and return descriptors
 */
export async function detectFaces(
  input: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement
): Promise<DetectedFace[]> {
  const faceapi = getFaceApi();
  if (!faceapi) throw new Error("face-api.js ачаалагдаагүй байна");

  const detections = await faceapi
    .detectAllFaces(input)
    .withFaceLandmarks()
    .withFaceDescriptors();

  return detections.map((d: any) => ({
    detection: d.detection,
    descriptor: d.descriptor,
    landmarks: d.alignedRect,
  }));
}

/**
 * Create labeled face descriptors from stored students
 */
export async function createLabeledDescriptors(
  students?: Student[]
): Promise<any[]> {
  const faceapi = getFaceApi();
  if (!faceapi) return [];

  const allStudents = students || await getStudents();
  const labeled: any[] = [];

  for (const student of allStudents) {
    if (student.descriptors.length === 0) continue;
    const descriptors = student.descriptors.map(
      (d) => new Float32Array(d)
    );
    labeled.push(
      new faceapi.LabeledFaceDescriptors(student.id, descriptors)
    );
  }

  return labeled;
}

/**
 * Match detected faces against known students
 */
export async function matchFaces(
  detectedFaces: DetectedFace[],
  threshold = 0.6
): Promise<RecognitionResult[]> {
  const faceapi = getFaceApi();
  if (!faceapi) return [];

  const labeled = await createLabeledDescriptors();
  if (labeled.length === 0) {
    // No students registered yet, all faces are unknown
    return detectedFaces.map((face) => ({
      face,
      student: null,
      distance: 1,
      label: "unknown",
    }));
  }

  const matcher = new faceapi.FaceMatcher(labeled, threshold);
  const students = await getStudents();

  return detectedFaces.map((face) => {
    const match = matcher.findBestMatch(face.descriptor);
    const student =
      match.label !== "unknown"
        ? students.find((s) => s.id === match.label) || null
        : null;

    return {
      face,
      student,
      distance: match.distance,
      label: student ? student.name : "Танигдаагүй",
    };
  });
}

/**
 * Extract a single face descriptor from an image
 */
export async function extractSingleDescriptor(
  input: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement
): Promise<Float32Array | null> {
  const faceapi = getFaceApi();
  if (!faceapi) return null;

  const detection = await faceapi
    .detectSingleFace(input)
    .withFaceLandmarks()
    .withFaceDescriptor();

  return detection?.descriptor ?? null;
}

/**
 * Crop a detected face from a canvas/image and return as Blob
 */
export async function cropFace(
  source: HTMLCanvasElement | HTMLImageElement,
  detection: any,
  padding = 40
): Promise<Blob> {
  const box = detection.box || detection;
  const canvas = document.createElement("canvas");
  const x = Math.max(0, box.x - padding);
  const y = Math.max(0, box.y - padding);
  const w = Math.min(box.width + padding * 2, (source as any).width - x);
  const h = Math.min(box.height + padding * 2, (source as any).height - y);

  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(source, x, y, w, h, 0, 0, w, h);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob!), "image/jpeg", 0.9);
  });
}
