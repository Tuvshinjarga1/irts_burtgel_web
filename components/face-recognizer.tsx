"use client";

import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Upload, ThumbsUp, ThumbsDown, ChevronDown, ChevronUp, Brain, Gauge } from "lucide-react";

interface TopKCandidate {
  name: string;
  score: number;
  above_threshold: boolean;
}

interface FaceResult {
  bbox: [number, number, number, number];
  identity: string;
  confidence: number;
  det_score?: number;
  top_k?: TopKCandidate[];
}

export function FaceRecognizer() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [faces, setFaces] = useState<FaceResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [threshold, setThreshold] = useState<number | null>(null);

  // For registering unknown names
  const [faceNames, setFaceNames] = useState<Record<number, string>>({});
  const [activeFaceIndex, setActiveFaceIndex] = useState<number | null>(null);
  const [registering, setRegistering] = useState(false);

  // RL feedback state
  const [feedbackSent, setFeedbackSent] = useState<Record<number, "correct" | "wrong">>({});
  const [feedbackLoading, setFeedbackLoading] = useState<Record<number, boolean>>({});
  const [expandedTopK, setExpandedTopK] = useState<Record<number, boolean>>({});
  const [rlInfo, setRlInfo] = useState<{ threshold: number } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (imageSrc && imageRef.current && canvasRef.current) {
      const img = imageRef.current;
      
      const handleLoad = () => {
        drawCanvas();
      };

      if (img.complete) {
        drawCanvas();
      } else {
        img.addEventListener("load", handleLoad);
        return () => img.removeEventListener("load", handleLoad);
      }
    }
  }, [imageSrc, faces]);

  const drawCanvas = () => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img) return;

    // Set canvas dimensions to match image natural dimensions
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Draw the image
    ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight);

    // Draw boxes
    faces.forEach((face, index) => {
      const [x1, y1, x2, y2] = face.bbox;
      const width = x2 - x1;
      const height = y2 - y1;
      
      const isUnknown = face.identity === "Unknown";
      
      // Draw rectangle
      ctx.strokeStyle = isUnknown ? "#ef4444" : "#22c55e"; // red for unknown, green for known
      ctx.lineWidth = 4;
      ctx.strokeRect(x1, y1, width, height);

      // Draw background for text
      ctx.fillStyle = isUnknown ? "#ef4444" : "#22c55e";
      const text = `${face.identity} (${(face.confidence * 100).toFixed(1)}%)`;
      ctx.font = "24px Arial";
      const textWidth = ctx.measureText(text).width;
      ctx.fillRect(x1, y1 - 32, textWidth + 8, 32);

      // Draw text
      ctx.fillStyle = "#ffffff";
      ctx.fillText(text, x1 + 4, y1 - 8);
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      setSelectedFile(file);
      setImageSrc(URL.createObjectURL(file));
      setFaces([]);
      setError(null);
      setFaceNames({});
    }
  };

  const handleRecognize = async () => {
    if (!selectedFile) return;

    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const res = await fetch("http://localhost:8000/recognize", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        throw new Error("Failed to recognize face");
      }

      const data = await res.json();
      if (data.results) {
        setFaces(data.results);
        setFeedbackSent({});
        setExpandedTopK({});
        if (data.threshold !== undefined) setThreshold(data.threshold);
      } else if (data.error) {
        setError(data.error);
      }
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  // ── RL Feedback ──────────────────────────────────────────────────────────
  const handleFeedback = async (index: number, correct: boolean) => {
    const face = faces[index];
    setFeedbackLoading(prev => ({ ...prev, [index]: true }));
    try {
      const res = await fetch("http://localhost:8000/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ correct, confidence: face.confidence }),
      });
      if (res.ok) {
        const data = await res.json();
        setFeedbackSent(prev => ({ ...prev, [index]: correct ? "correct" : "wrong" }));
        if (data.threshold !== undefined) {
          setThreshold(data.threshold);
          setRlInfo({ threshold: data.threshold });
        }
      }
    } catch (e) {
      // feedback is best-effort
    } finally {
      setFeedbackLoading(prev => ({ ...prev, [index]: false }));
    }
  };

  const handleRegister = async (index: number) => {
    const name = faceNames[index];
    if (!selectedFile || !name?.trim()) return;
    
    const face = faces[index];
    const [x1, y1, x2, y2] = face.bbox;

    setRegistering(true);
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("name", name.trim());
      formData.append("x1", String(x1));
      formData.append("y1", String(y1));
      formData.append("x2", String(x2));
      formData.append("y2", String(y2));

      const res = await fetch("http://localhost:8000/register", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        throw new Error("Failed to register face");
      }

      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        // Success, re-run recognition to see the updated identity
        alert(`Successfully registered as ${name.trim()}`);
        setFaceNames(prev => {
          const next = { ...prev };
          delete next[index];
          return next;
        });
        handleRecognize();
      }
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      setRegistering(false);
    }
  };

  const onCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img || faces.length === 0) return;

    const rect = canvas.getBoundingClientRect();
    const clickX_canvas = e.clientX - rect.left;
    const clickY_canvas = e.clientY - rect.top;

    // We need to transform clickX/Y back to image coordinates
    // Considering object-fit: contain
    const isLandscape = img.naturalWidth / img.naturalHeight > canvas.clientWidth / canvas.clientHeight;
    let renderWidth, renderHeight, offsetX = 0, offsetY = 0;
    
    if (isLandscape) {
      renderWidth = canvas.clientWidth;
      renderHeight = (img.naturalHeight / img.naturalWidth) * renderWidth;
      offsetY = (canvas.clientHeight - renderHeight) / 2;
    } else {
      renderHeight = canvas.clientHeight;
      renderWidth = (img.naturalWidth / img.naturalHeight) * renderHeight;
      offsetX = (canvas.clientWidth - renderWidth) / 2;
    }
    
    const scale = renderWidth / img.naturalWidth;
    
    // Find if click is inside any face bbox
    let foundIndex = -1;
    for (let i = 0; i < faces.length; i++) {
        const [x1, y1, x2, y2] = faces[i].bbox;
        const boxX = (x1 * scale) + offsetX;
        const boxY = (y1 * scale) + offsetY;
        const boxW = (x2 - x1) * scale;
        const boxH = (y2 - y1) * scale;

        if (clickX_canvas >= boxX && clickX_canvas <= boxX + boxW &&
            clickY_canvas >= boxY && clickY_canvas <= boxY + boxH) {
            foundIndex = i;
            break;
        }
    }

    if (foundIndex !== -1 && faces[foundIndex].identity === "Unknown") {
        setActiveFaceIndex(foundIndex);
    } else {
        setActiveFaceIndex(null);
    }
  };

  return (
    <Card className="w-full max-w-4xl mx-auto shadow-lg">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle>AI Царай Таних Систем</CardTitle>
            <CardDescription>
              Зураг оруулж царайгаа таниулах болон танигдаагүй царайг системд шинээр бүртгэх
            </CardDescription>
          </div>
          {threshold !== null && (
            <div className="flex items-center gap-2 shrink-0 ml-4">
              <div className="flex items-center gap-1.5 bg-violet-50 border border-violet-200 rounded-lg px-3 py-1.5">
                <Brain className="w-4 h-4 text-violet-600" />
                <span className="text-xs font-medium text-violet-700">RL Threshold</span>
                <span className="text-sm font-bold text-violet-900">{(threshold * 100).toFixed(1)}%</span>
              </div>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex gap-4">
          <Input 
            type="file" 
            accept="image/*" 
            onChange={handleFileChange} 
            className="cursor-pointer max-w-sm"
          />
          <Button 
            onClick={handleRecognize} 
            disabled={!selectedFile || loading}
            className="w-32"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Upload className="w-4 h-4 mr-2" />}
            Таних
          </Button>
        </div>

        {error && (
          <div className="p-4 bg-red-100 text-red-700 rounded-md">
            {error}
          </div>
        )}

        {imageSrc && (
          <div className="relative border rounded-lg overflow-hidden bg-gray-50 flex justify-center items-center">
            {/* Hidden original image needed for natural sizing */}
            <img 
              ref={imageRef} 
              src={imageSrc} 
              alt="Hidden original" 
              className="hidden"
            />
            {/* Canvas will display the image with bounding boxes */}
            <canvas 
              ref={canvasRef} 
              onClick={onCanvasClick}
              className="max-w-full max-h-[600px] object-contain relative cursor-pointer"
            />
            
            {/* Overlay inputs for unknown faces */}
            {canvasRef.current && imageRef.current && faces.map((face, index) => {
              if (face.identity !== "Unknown" || activeFaceIndex !== index) return null;

              const canvas = canvasRef.current!;
              const img = imageRef.current!;
              
              const isLandscape = img.naturalWidth / img.naturalHeight > canvas.clientWidth / canvas.clientHeight;
              let renderWidth, renderHeight, offsetX = 0, offsetY = 0;
              
              if (isLandscape) {
                renderWidth = canvas.clientWidth;
                renderHeight = (img.naturalHeight / img.naturalWidth) * renderWidth;
                offsetY = (canvas.clientHeight - renderHeight) / 2;
              } else {
                renderHeight = canvas.clientHeight;
                renderWidth = (img.naturalWidth / img.naturalHeight) * renderHeight;
                offsetX = (canvas.clientWidth - renderWidth) / 2;
              }
              
              const scale = renderWidth / img.naturalWidth;
              const [x1, y1, x2, y2] = face.bbox;
              
              const boxX = (x1 * scale) + offsetX;
              const boxY = (y1 * scale) + offsetY;
              const boxW = (x2 - x1) * scale;
              const boxH = (y2 - y1) * scale;

              const currentName = faceNames[index] || "";

              return (
                <div 
                  key={`overlay-${index}`}
                  className="absolute animate-in fade-in zoom-in duration-200"
                  style={{
                    left: `${boxX + (boxW/2) - 100}px`,
                    top: `${boxY + (boxH/2) - 40}px`,
                    width: `200px`,
                    zIndex: 20
                  }}
                >
                  <div className="bg-white p-3 rounded-xl shadow-2xl border-2 border-primary/20 backdrop-blur-sm">
                    <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Нэр оноох</p>
                    <Input 
                      autoFocus
                      placeholder="Нэрийг оруулна уу" 
                      value={currentName}
                      onChange={(e) => {
                        setFaceNames(prev => ({
                          ...prev,
                          [index]: e.target.value
                        }));
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRegister(index);
                        if (e.key === 'Escape') setActiveFaceIndex(null);
                      }}
                      className="h-10 text-sm mb-3 border-primary/10 focus:border-primary"
                    />
                    <div className="flex gap-2">
                      <Button 
                        size="sm" 
                        onClick={() => handleRegister(index)} 
                        disabled={registering || !currentName.trim()}
                        className="flex-1 h-9"
                      >
                        {registering ? <Loader2 className="w-4 h-4 animate-spin" /> : "Хадгалах"}
                      </Button>
                      <Button 
                        size="sm" 
                        variant="secondary" 
                        onClick={() => {
                          setActiveFaceIndex(null);
                        }}
                        disabled={registering}
                        className="h-9 px-3"
                      >
                        Хаах
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {faces.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="text-lg font-medium">Илэрсэн царайнууд:</h3>
              <Badge variant="outline" className="text-xs">{faces.length} царай</Badge>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {faces.map((face, index) => {
                const isUnknown = face.identity === "Unknown";
                const feedback = feedbackSent[index];
                const isLoadingFb = feedbackLoading[index];
                const showTopK = expandedTopK[index];

                return (
                  <div
                    key={index}
                    className={`rounded-xl border-2 overflow-hidden transition-all ${
                      isUnknown
                        ? "border-red-200 bg-gradient-to-br from-red-50 to-orange-50"
                        : "border-green-200 bg-gradient-to-br from-green-50 to-emerald-50"
                    }`}
                  >
                    {/* Header */}
                    <div className={`px-4 py-2 flex items-center justify-between ${
                      isUnknown ? "bg-red-100/60" : "bg-green-100/60"
                    }`}>
                      <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${
                          isUnknown ? "bg-red-500" : "bg-green-500"
                        }`} />
                        <span className="font-semibold text-sm">
                          {isUnknown ? "Танихгүй хүн" : face.identity}
                        </span>
                      </div>
                      <Badge
                        variant="secondary"
                        className={`text-xs font-bold ${
                          isUnknown ? "bg-red-200 text-red-800" : "bg-green-200 text-green-800"
                        }`}
                      >
                        {(face.confidence * 100).toFixed(1)}%
                      </Badge>
                    </div>

                    <div className="px-4 py-3 space-y-3">
                      {/* Detection confidence bar */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px] text-gray-500 font-medium uppercase">
                          <span>Таних нарийвчлал</span>
                          <span>{(face.confidence * 100).toFixed(1)}%</span>
                        </div>
                        <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-700 ${
                              isUnknown ? "bg-red-400" : "bg-green-500"
                            }`}
                            style={{ width: `${Math.min(face.confidence * 100, 100)}%` }}
                          />
                        </div>
                      </div>

                      {/* RL Reward Feedback — only for known faces */}
                      {!isUnknown && (
                        <div className="space-y-1.5">
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide flex items-center gap-1">
                            <Brain className="w-3 h-3" /> RL Feedback
                          </p>
                          {feedback ? (
                            <div className={`flex items-center gap-2 text-xs font-medium rounded-lg px-3 py-1.5 ${
                              feedback === "correct"
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-rose-100 text-rose-700"
                            }`}>
                              {feedback === "correct" ? (
                                <><ThumbsUp className="w-3.5 h-3.5" /> Зөв гэж тэмдэглэгдлээ</>  
                              ) : (
                                <><ThumbsDown className="w-3.5 h-3.5" /> Буруу гэж тэмдэглэгдлээ</>
                              )}
                            </div>
                          ) : (
                            <div className="flex gap-2">
                              <Button
                                id={`feedback-correct-${index}`}
                                size="sm"
                                variant="outline"
                                className="flex-1 h-8 text-xs border-green-300 text-green-700 hover:bg-green-100 hover:border-green-400 gap-1"
                                disabled={isLoadingFb}
                                onClick={() => handleFeedback(index, true)}
                              >
                                {isLoadingFb ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <ThumbsUp className="w-3 h-3" />
                                )}
                                Зөв
                              </Button>
                              <Button
                                id={`feedback-wrong-${index}`}
                                size="sm"
                                variant="outline"
                                className="flex-1 h-8 text-xs border-red-300 text-red-700 hover:bg-red-100 hover:border-red-400 gap-1"
                                disabled={isLoadingFb}
                                onClick={() => handleFeedback(index, false)}
                              >
                                {isLoadingFb ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <ThumbsDown className="w-3 h-3" />
                                )}
                                Буруу
                              </Button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Top-K candidates */}
                      {face.top_k && face.top_k.length > 0 && (
                        <div className="space-y-1.5">
                          <button
                            className="flex items-center gap-1 text-[10px] font-bold text-gray-400 uppercase tracking-wide w-full hover:text-gray-600 transition-colors"
                            onClick={() => setExpandedTopK(prev => ({ ...prev, [index]: !prev[index] }))}
                          >
                            <Gauge className="w-3 h-3" />
                            Top топ дүнгүүд
                            {showTopK ? <ChevronUp className="w-3 h-3 ml-auto" /> : <ChevronDown className="w-3 h-3 ml-auto" />}
                          </button>
                          {showTopK && (
                            <div className="space-y-1">
                              {face.top_k.map((cand, ci) => (
                                <div key={ci} className="flex items-center justify-between text-xs rounded px-2 py-1 bg-white/70">
                                  <span className={`font-medium ${
                                    cand.above_threshold ? "text-green-700" : "text-gray-500"
                                  }`}>{cand.name}</span>
                                  <span className={`font-mono text-[11px] ${
                                    cand.above_threshold ? "text-green-600" : "text-gray-400"
                                  }`}>{(cand.score * 100).toFixed(1)}%</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Register form for unknown faces */}
                      {isUnknown && (
                        <div className="space-y-2 pt-1">
                          <Input
                            placeholder="Нэрийг оруулна уу"
                            value={faceNames[index] || ""}
                            onChange={(e) => {
                              setFaceNames(prev => ({ ...prev, [index]: e.target.value }));
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleRegister(index);
                            }}
                            className="h-9 text-sm"
                          />
                          <Button
                            size="sm"
                            onClick={() => handleRegister(index)}
                            disabled={registering || !(faceNames[index]?.trim())}
                            className="w-full h-9"
                          >
                            {registering && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                            Хадгалах
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
