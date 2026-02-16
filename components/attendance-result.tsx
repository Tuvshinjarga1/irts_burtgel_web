"use client";

import { CheckCircle, HelpCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { RecognitionResult } from "@/lib/face-recognition";

interface AttendanceResultProps {
  results: RecognitionResult[];
}

export function AttendanceResult({ results }: AttendanceResultProps) {
  const recognized = results.filter((r) => r.student !== null);
  const unrecognized = results.filter((r) => r.student === null);

  return (
    <div className="flex flex-col gap-4">
      {/* Summary */}
      <div className="flex items-center gap-4">
        <Badge variant="secondary" className="bg-success/10 text-success gap-1 px-3 py-1">
          <CheckCircle className="h-3 w-3" />
          {recognized.length} танигдсан
        </Badge>
        {unrecognized.length > 0 && (
          <Badge variant="secondary" className="bg-warning/10 text-warning gap-1 px-3 py-1">
            <HelpCircle className="h-3 w-3" />
            {unrecognized.length} танигдаагүй
          </Badge>
        )}
      </div>

      {/* Recognized list */}
      {recognized.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-medium text-foreground">
            Танигдсан сурагчид
          </h4>
          <div className="flex flex-wrap gap-2">
            {recognized.map((r, i) => (
              <div
                key={i}
                className="flex items-center gap-2 rounded-lg border border-success/20 bg-success/5 px-3 py-2"
              >
                <CheckCircle className="h-4 w-4 text-success" />
                <span className="text-sm font-medium text-foreground">
                  {r.student!.name}
                </span>
                <span className="text-xs text-muted-foreground">
                  ({Math.round((1 - r.distance) * 100)}%)
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
