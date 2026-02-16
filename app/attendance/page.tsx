"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Camera,
  Loader2,
  CheckCircle,
  BookOpen,
  ScanFace,
  Save,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { CameraCapture } from "@/components/camera-capture";
import { AttendanceResult } from "@/components/attendance-result";
import { UnrecognizedFaces } from "@/components/unrecognized-faces";
import {
  getClasses,
  getStudentsByClass,
  addAttendanceRecord,
  type ClassInfo,
  type UnrecognizedFace,
} from "@/lib/storage";
import { savePhoto } from "@/lib/db";
import { loadFaceApi, getFaceApi } from "@/lib/face-api-loader";
import {
  detectFaces,
  matchFaces,
  cropFace,
  type RecognitionResult,
} from "@/lib/face-recognition";

export default function AttendancePage() {
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [classStudents, setClassStudents] = useState<any[]>([]);
  const [faceApiReady, setFaceApiReady] = useState(false);
  const [faceApiLoading, setFaceApiLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState("");
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState<RecognitionResult[] | null>(null);
  const [unrecognizedFaces, setUnrecognizedFaces] = useState<
    UnrecognizedFace[]
  >([]);
  const [saved, setSaved] = useState(false);
  const [capturedImageElement, setCapturedImageElement] =
    useState<HTMLImageElement | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const canvasOverlayRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    getClasses().then(setClasses);
  }, []);

  useEffect(() => {
    if (selectedClassId) {
      getStudentsByClass(selectedClassId).then(setClassStudents);
    } else {
      setClassStudents([]);
    }
  }, [selectedClassId]);

  const initFaceApi = useCallback(async () => {
    if (faceApiReady) return;
    setFaceApiLoading(true);
    setLoadingProgress(0);
    try {
      await loadFaceApi((stage) => {
        setLoadingStage(stage);
        setLoadingProgress((prev) => Math.min(prev + 25, 95));
      });
      setFaceApiReady(true);
      setLoadingProgress(100);
    } catch {
      toast.error("Нүүр таних загвар ачаалж чадсангүй");
    } finally {
      setFaceApiLoading(false);
    }
  }, [faceApiReady]);

  // Draw face detection overlay
  const drawOverlay = useCallback(
    (
      img: HTMLImageElement,
      recognitionResults: RecognitionResult[]
    ) => {
      const canvas = canvasOverlayRef.current;
      if (!canvas) return;

      const faceapi = getFaceApi();
      if (!faceapi) return;

      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);

      for (const result of recognitionResults) {
        const box = result.face.detection.box;
        const isRecognized = result.student !== null;

        // Draw box
        ctx.strokeStyle = isRecognized ? "#22c55e" : "#eab308";
        ctx.lineWidth = 3;
        ctx.strokeRect(box.x, box.y, box.width, box.height);

        // Draw label background
        const label = result.label;
        ctx.font = "bold 16px sans-serif";
        const textWidth = ctx.measureText(label).width;
        const labelHeight = 24;
        ctx.fillStyle = isRecognized
          ? "rgba(34, 197, 94, 0.85)"
          : "rgba(234, 179, 8, 0.85)";
        ctx.fillRect(
          box.x,
          box.y - labelHeight - 2,
          textWidth + 12,
          labelHeight
        );
        ctx.fillStyle = isRecognized ? "#ffffff" : "#000000";
        ctx.fillText(label, box.x + 6, box.y - 7);
      }
    },
    []
  );

  const handleCapture = useCallback(
    async (blob: Blob, img: HTMLImageElement) => {
      setCapturedBlob(blob);
      setCapturedImageElement(img);

      if (!selectedClassId) {
        toast.error("Эхлээд анги сонгоно уу");
        return;
      }

      setProcessing(true);
      setResults(null);
      setUnrecognizedFaces([]);
      setSaved(false);

      try {
        if (!faceApiReady) await initFaceApi();

        // Detect all faces
        const faces = await detectFaces(img);
        if (faces.length === 0) {
          toast.error("Зургаас нүүр олдсонгүй. Дахин оролдоно уу.");
          setProcessing(false);
          return;
        }

        // Match faces against registered students
        const matchResults = await matchFaces(faces, 0.6);
        setResults(matchResults);

        // Draw overlay
        drawOverlay(img, matchResults);

        // Crop and save unrecognized faces
        const unknown: UnrecognizedFace[] = [];
        for (const result of matchResults) {
          if (result.student === null) {
            const cropBlob = await cropFace(img, result.face.detection);
            const cropKey = `unrecognized-${crypto.randomUUID()}`;
            await savePhoto(cropKey, cropBlob);
            unknown.push({
              descriptor: Array.from(result.face.descriptor),
              cropKey,
            });
          }
        }
        setUnrecognizedFaces(unknown);

        const recognized = matchResults.filter((r) => r.student !== null);
        toast.success(
          `${faces.length} нүүр олдлоо, ${recognized.length} танигдлаа`
        );
      } catch (err) {
        toast.error("Нүүр таних үед алдаа гарлаа");
        console.error(err);
      } finally {
        setProcessing(false);
      }
    },
    [selectedClassId, faceApiReady, initFaceApi, drawOverlay]
  );

  const handleSaveAttendance = async () => {
    if (!results || !selectedClassId) return;

    const presentIds = results
      .filter((r) => r.student !== null)
      .map((r) => r.student!.id);

    // Deduplicate
    const uniquePresentIds = [...new Set(presentIds)];

    // Save group photo
    let photoKey = "";
    if (capturedBlob) {
      photoKey = `attendance-${crypto.randomUUID()}`;
      await savePhoto(photoKey, capturedBlob);
    }

    const today = new Date();
    addAttendanceRecord({
      classId: selectedClassId,
      date: today.toISOString().split("T")[0],
      timestamp: today.toISOString(),
      presentStudentIds: uniquePresentIds,
      photoKey,
      unrecognizedFaces,
    });

    const students = await getStudentsByClass(selectedClassId);
    setSaved(true);
    toast.success(
      `Ирц хадгаллаа: ${uniquePresentIds.length}/${students.length} сурагч ирсэн`
    );
  };

  const handleReset = () => {
    setResults(null);
    setUnrecognizedFaces([]);
    setSaved(false);
    setCapturedImageElement(null);
    setCapturedBlob(null);
  };

  const selectedClass = classes.find((c) => c.id === selectedClassId);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Ирц бүртгэх
        </h1>
        <p className="text-sm text-muted-foreground">
          Зураг авч AI-аар сурагчдыг танин ирцийг бүртгэх
        </p>
      </div>

      {/* Face-api loading */}
      {faceApiLoading && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="py-4">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <p className="text-sm font-medium text-foreground">
                  {loadingStage}
                </p>
              </div>
              <Progress value={loadingProgress} className="h-2" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Class selector */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <BookOpen className="h-5 w-5 text-primary" />
            Анги сонгох
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Label className="text-foreground">Ангийн нэр</Label>
              <Select
                value={selectedClassId}
                onValueChange={(v) => {
                  setSelectedClassId(v);
                  handleReset();
                }}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Анги сонгоно уу" />
                </SelectTrigger>
                <SelectContent>
                  {classes.map((cls) => (
                    <SelectItem key={cls.id} value={cls.id}>
                      {cls.name} ({cls.studentIds.length} сурагч)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedClass && (
              <div className="text-sm text-muted-foreground">
                {classStudents.length} бүртгэлтэй сурагч
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Camera + Capture */}
      {selectedClassId && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <Camera className="h-5 w-5 text-primary" />
              Зураг авах
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {/* Camera Capture - always visible */}
            {!capturedImageElement && (
              <CameraCapture
                onCapture={(blob, img) => {
                  initFaceApi();
                  handleCapture(blob, img);
                }}
                showPreview={false}
              />
            )}

            {/* Processing indicator */}
            {processing && (
              <div className="flex flex-col items-center gap-3 py-8">
                <ScanFace className="h-12 w-12 animate-pulse text-primary" />
                <p className="text-sm font-medium text-foreground">
                  Нүүрүүдийг таньж байна...
                </p>
                <p className="text-xs text-muted-foreground">
                  Та түр хүлээнэ үү
                </p>
              </div>
            )}

            {/* Captured image with detection results */}
            {capturedImageElement && (
              <div className="flex flex-col gap-4">
                <div className="relative overflow-hidden rounded-lg border border-border">
                  <canvas
                    ref={canvasOverlayRef}
                    className="w-full"
                    style={{ display: "block" }}
                  />
                </div>

                {/* Results */}
                {results && <AttendanceResult results={results} />}

                {/* Unrecognized faces */}
                {unrecognizedFaces.length > 0 && (
                  <UnrecognizedFaces
                    faces={unrecognizedFaces}
                    classId={selectedClassId}
                    onResolved={() => {
                      // Re-run matching after linking a face
                      if (capturedImageElement) {
                        handleCapture(capturedBlob!, capturedImageElement);
                      }
                    }}
                  />
                )}

                {/* Save / Reset */}
                <div className="flex flex-wrap gap-3">
                  {!saved ? (
                    <Button
                      onClick={handleSaveAttendance}
                      className="gap-2"
                    >
                      <Save className="h-4 w-4" />
                      Ирц хадгалах
                    </Button>
                  ) : (
                    <div className="flex items-center gap-2 rounded-lg bg-success/10 px-4 py-2">
                      <CheckCircle className="h-5 w-5 text-success" />
                      <p className="text-sm font-medium text-success">
                        Ирц амжилттай хадгалагдлаа!
                      </p>
                    </div>
                  )}
                  <Button variant="outline" onClick={handleReset}>
                    Шинэ зураг авах
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* No class selected message */}
      {!selectedClassId && classes.length > 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12">
            <Camera className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              Ирц бүртгэхийн тулд эхлээд анги сонгоно уу
            </p>
          </CardContent>
        </Card>
      )}

      {classes.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12">
            <BookOpen className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              Эхлээд анги болон сурагчдыг бүртгэнэ үү
            </p>
            <Button variant="outline" size="sm" asChild>
              <a href="/students">Сурагчид руу очих</a>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
