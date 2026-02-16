"use client";

import { useState, useEffect } from "react";
import { UserPlus, Link2, Loader2, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  getStudentsByClass,
  addStudent,
  addDescriptorToStudent,
  type Student,
} from "@/lib/storage";
import { savePhoto, getPhotoURL } from "@/lib/db";

interface UnrecognizedFaceData {
  descriptor: number[];
  cropKey: string;
}

interface UnrecognizedFacesProps {
  faces: UnrecognizedFaceData[];
  classId: string;
  onResolved: () => void;
}

export function UnrecognizedFaces({
  faces,
  classId,
  onResolved,
}: UnrecognizedFacesProps) {
  const [faceUrls, setFaceUrls] = useState<Record<string, string>>({});
  const [students, setStudents] = useState<Student[]>([]);

  // Link to existing student
  const [linkingFace, setLinkingFace] = useState<UnrecognizedFaceData | null>(
    null
  );
  const [selectedStudentId, setSelectedStudentId] = useState("");

  // Add as new student
  const [addingFace, setAddingFace] = useState<UnrecognizedFaceData | null>(
    null
  );
  const [newName, setNewName] = useState("");
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    getStudentsByClass(classId).then(setStudents);
    faces.forEach(async (f) => {
      const url = await getPhotoURL(f.cropKey);
      if (url) setFaceUrls((prev) => ({ ...prev, [f.cropKey]: url }));
    });
  }, [faces, classId]);

  const handleLinkToStudent = async () => {
    if (!linkingFace || !selectedStudentId) return;
    setProcessing(true);
    try {
      await addDescriptorToStudent(
        selectedStudentId,
        linkingFace.descriptor,
        linkingFace.cropKey
      );
      const student = students.find((s) => s.id === selectedStudentId);
      toast.success(
        `Нүүрийг "${student?.name}" сурагчтай холболоо. Дараа илүү сайн танина.`
      );
      setLinkingFace(null);
      setSelectedStudentId("");
      onResolved();
    } catch {
      toast.error("Алдаа гарлаа");
    } finally {
      setProcessing(false);
    }
  };

  const handleAddNewStudent = async () => {
    if (!addingFace || !newName.trim()) return;
    setProcessing(true);
    try {
      await addStudent(newName.trim(), classId, [addingFace.descriptor], [addingFace.cropKey]);
      toast.success(`"${newName.trim()}" шинэ сурагч бүртгэлээ`);
      setAddingFace(null);
      setNewName("");
      onResolved();
    } catch {
      toast.error("Алдаа гарлаа");
    } finally {
      setProcessing(false);
    }
  };

  if (faces.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <h4 className="flex items-center gap-2 text-sm font-medium text-foreground">
        <HelpCircle className="h-4 w-4 text-warning" />
        Танигдаагүй нүүрүүд ({faces.length})
      </h4>
      <p className="text-xs text-muted-foreground">
        Танигдаагүй нүүрүүдийг одоо байгаа сурагчтай холбох эсвэл шинэ сурагч
        нэмж загварыг сайжруулах боломжтой.
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {faces.map((face, idx) => (
          <div
            key={face.cropKey}
            className="flex flex-col items-center gap-2 rounded-lg border border-warning/20 bg-warning/5 p-3"
          >
            <div className="h-20 w-20 overflow-hidden rounded-lg bg-muted">
              {faceUrls[face.cropKey] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={faceUrls[face.cropKey]}
                  alt={`Танигдаагүй нүүр ${idx + 1}`}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <HelpCircle className="h-8 w-8 text-muted-foreground/40" />
                </div>
              )}
            </div>
            <p className="text-xs font-medium text-foreground">
              Танигдаагүй #{idx + 1}
            </p>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1 px-2 text-xs"
                onClick={async () => {
                  setLinkingFace(face);
                  const list = await getStudentsByClass(classId);
                  setStudents(list);
                }}
              >
                <Link2 className="h-3 w-3" />
                Холбох
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1 px-2 text-xs"
                onClick={() => setAddingFace(face)}
              >
                <UserPlus className="h-3 w-3" />
                Шинэ
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* Link to existing student dialog */}
      <Dialog
        open={!!linkingFace}
        onOpenChange={(open) => !open && setLinkingFace(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-foreground">
              Сурагчтай холбох
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Энэ нүүрийг аль сурагчтай холбох вэ? Холбосноор тухайн сурагчийг
            дараа илүү сайн танина.
          </p>
          <Select
            value={selectedStudentId}
            onValueChange={setSelectedStudentId}
          >
            <SelectTrigger>
              <SelectValue placeholder="Сурагч сонгоно уу" />
            </SelectTrigger>
            <SelectContent>
              {students.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Болих</Button>
            </DialogClose>
            <Button
              onClick={handleLinkToStudent}
              disabled={!selectedStudentId || processing}
              className="gap-2"
            >
              {processing && <Loader2 className="h-4 w-4 animate-spin" />}
              Холбох
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add as new student dialog */}
      <Dialog
        open={!!addingFace}
        onOpenChange={(open) => !open && setAddingFace(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-foreground">
              Шинэ сурагч бүртгэх
            </DialogTitle>
          </DialogHeader>
          <div>
            <Label htmlFor="new-student-name" className="text-foreground">
              Сурагчийн нэр
            </Label>
            <Input
              id="new-student-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Нэр оруулна уу"
              className="mt-1"
            />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Болих</Button>
            </DialogClose>
            <Button
              onClick={handleAddNewStudent}
              disabled={!newName.trim() || processing}
              className="gap-2"
            >
              {processing && <Loader2 className="h-4 w-4 animate-spin" />}
              Бүртгэх
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
