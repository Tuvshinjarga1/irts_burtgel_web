"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { Camera, Upload, RotateCcw, X, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CameraCaptureProps {
  onCapture: (blob: Blob, imgElement: HTMLImageElement) => void;
  className?: string;
  showPreview?: boolean;
  compact?: boolean;
}

export function CameraCapture({
  onCapture,
  className,
  showPreview = true,
  compact = false,
}: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [streaming, setStreaming] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startCamera = useCallback(async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setStreaming(true);
      }
    } catch {
      setError("Камерт хандах боломжгүй байна. Камерын зөвшөөрлийг шалгана уу.");
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (videoRef.current?.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }
    setStreaming(false);
  }, []);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  const takePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(video, 0, 0);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        setCapturedImage(url);
        stopCamera();

        const img = new window.Image();
        img.crossOrigin = "anonymous";
        img.onload = () => onCapture(blob, img);
        img.src = url;
      },
      "image/jpeg",
      0.9
    );
  }, [onCapture, stopCamera]);

  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const url = URL.createObjectURL(file);
      setCapturedImage(url);

      const img = new window.Image();
      img.crossOrigin = "anonymous";
      img.onload = () => onCapture(file, img);
      img.src = url;

      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [onCapture]
  );

  const reset = useCallback(() => {
    if (capturedImage) URL.revokeObjectURL(capturedImage);
    setCapturedImage(null);
    setError(null);
  }, [capturedImage]);

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <canvas ref={canvasRef} className="hidden" />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileUpload}
      />

      {/* Video / Preview area */}
      {!capturedImage && (
        <div
          className={cn(
            "relative overflow-hidden rounded-lg border-2 border-dashed border-border bg-muted/50",
            compact ? "aspect-square max-w-[300px]" : "aspect-video w-full"
          )}
        >
          {streaming ? (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6">
              <Camera className="h-10 w-10 text-muted-foreground/50" />
              <p className="text-center text-sm text-muted-foreground">
                {error || "Камер асаах эсвэл зураг оруулах"}
              </p>
            </div>
          )}

          {streaming && (
            <div className="absolute inset-x-0 bottom-0 flex justify-center bg-gradient-to-t from-foreground/60 to-transparent p-4">
              <Button
                onClick={takePhoto}
                size="lg"
                className="rounded-full bg-card text-foreground shadow-lg hover:bg-card/90"
              >
                <Camera className="mr-2 h-5 w-5" />
                Зураг авах
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Captured preview */}
      {capturedImage && showPreview && (
        <div
          className={cn(
            "relative overflow-hidden rounded-lg border border-border",
            compact ? "aspect-square max-w-[300px]" : "aspect-video w-full"
          )}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={capturedImage}
            alt="Авсан зураг"
            className="h-full w-full object-cover"
          />
          <div className="absolute right-2 top-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-success">
              <CheckCircle className="h-4 w-4 text-success-foreground" />
            </div>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-wrap gap-2">
        {!capturedImage && !streaming && (
          <>
            <Button onClick={startCamera} variant="default" className="gap-2">
              <Camera className="h-4 w-4" />
              Камер асаах
            </Button>
            <Button
              onClick={() => fileInputRef.current?.click()}
              variant="outline"
              className="gap-2"
            >
              <Upload className="h-4 w-4" />
              Зураг оруулах
            </Button>
          </>
        )}
        {streaming && !capturedImage && (
          <Button onClick={stopCamera} variant="outline" className="gap-2">
            <X className="h-4 w-4" />
            Камер унтраах
          </Button>
        )}
        {capturedImage && (
          <Button onClick={reset} variant="outline" className="gap-2">
            <RotateCcw className="h-4 w-4" />
            Дахин авах
          </Button>
        )}
      </div>
    </div>
  );
}
