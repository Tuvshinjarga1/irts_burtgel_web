"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Users,
  Plus,
  Trash2,
  BookOpen,
  Edit2,
  ImagePlus,
  Loader2,
  ScanFace,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { CameraCapture } from "@/components/camera-capture";
import {
  getClasses,
  addClass,
  updateClass,
  deleteClass,
  getStudentsByClass,
  addStudent,
  deleteStudent,
  addDescriptorToStudent,
  type ClassInfo,
  type Student,
} from "@/lib/storage";
import { savePhoto, getPhotoURL } from "@/lib/db";
import { loadFaceApi } from "@/lib/face-api-loader";
import { extractSingleDescriptor } from "@/lib/face-recognition";

export default function StudentsPage() {
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>("");
  const [students, setStudents] = useState<Student[]>([]);
  const [newClassName, setNewClassName] = useState("");
  const [editingClass, setEditingClass] = useState<ClassInfo | null>(null);
  const [editClassName, setEditClassName] = useState("");

  // New student form
  const [newStudentName, setNewStudentName] = useState("");
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [capturedImg, setCapturedImg] = useState<HTMLImageElement | null>(null);
  const [addStudentOpen, setAddStudentOpen] = useState(false);

  // Face-api loading
  const [faceApiLoading, setFaceApiLoading] = useState(false);
  const [faceApiReady, setFaceApiReady] = useState(false);
  const [loadingStage, setLoadingStage] = useState("");
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [processing, setProcessing] = useState(false);

  // Student photos
  const [studentPhotos, setStudentPhotos] = useState<Record<string, string>>(
    {}
  );

  // Additional photo for fine-tuning
  const [fineTuneStudentId, setFineTuneStudentId] = useState<string | null>(
    null
  );

  const refreshClasses = useCallback(async () => {
    const allClasses = await getClasses();
    setClasses(allClasses);
    if (!selectedClassId && allClasses.length > 0) {
      setSelectedClassId(allClasses[0].id);
    }
  }, [selectedClassId]);

  const refreshStudents = useCallback(async () => {
    if (!selectedClassId) {
      setStudents([]);
      return;
    }
    const list = await getStudentsByClass(selectedClassId);
    setStudents(list);

    // Load photos
    const photos: Record<string, string> = {};
    for (const s of list) {
      if (s.photoKeys.length > 0) {
        // photoKeys are now URLs
        const url = await getPhotoURL(s.photoKeys[0]);
        if (url) {
          photos[s.id] = url;
        }
      }
    }
    setStudentPhotos(prev => ({ ...prev, ...photos }));
  }, [selectedClassId]);

  useEffect(() => {
    refreshClasses();
  }, [refreshClasses]);

  useEffect(() => {
    refreshStudents();
  }, [refreshStudents]);

  // Load face-api
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

  // Class management
  const handleAddClass = async () => {
    if (!newClassName.trim()) return;
    try {
      const created = await addClass(newClassName.trim());
      setNewClassName("");
      setSelectedClassId(created.id);
      await refreshClasses();
      toast.success(`"${created.name}" анги үүсгэлээ`);
    } catch (error) {
      toast.error("Анги үүсгэхэд алдаа гарлаа");
      console.error(error);
    }
  };

  const handleUpdateClass = async () => {
    if (!editingClass || !editClassName.trim()) return;
    try {
      await updateClass(editingClass.id, editClassName.trim());
      setEditingClass(null);
      setEditClassName("");
      await refreshClasses();
      toast.success("Ангийн нэр шинэчлэгдлээ");
    } catch (error) {
      toast.error("Анги шинэчлэхэд алдаа гарлаа");
      console.error(error);
    }
  };

  const handleDeleteClass = async (cls: ClassInfo) => {
    try {
      await deleteClass(cls.id);
      if (selectedClassId === cls.id) setSelectedClassId("");
      await refreshClasses();
      await refreshStudents(); // clearing usually
      toast.success(`"${cls.name}" анги устгагдлаа`);
    } catch (error) {
      toast.error("Анги устгахад алдаа гарлаа");
      console.error(error);
    }
  };

  // Student management
  const handleAddStudent = async () => {
    if (!newStudentName.trim() || !selectedClassId) return;
    if (!capturedBlob || !capturedImg) {
      toast.error("Сурагчийн зураг авна уу");
      return;
    }

    setProcessing(true);
    try {
      if (!faceApiReady) await initFaceApi();

      const descriptor = await extractSingleDescriptor(capturedImg);
      if (!descriptor) {
        toast.error(
          "Зургаас нүүр олдсонгүй. Нүүр тод харагдах зураг авна уу."
        );
        setProcessing(false);
        return;
      }

      const photoKey = `student-${crypto.randomUUID()}`;
      // Upload to ImgBB and get URL
      // We ignore the key argument effectively in implementation but pass it anyway or empty string
      const photoUrl = await savePhoto(photoKey, capturedBlob);

      await addStudent(
        newStudentName.trim(),
        selectedClassId,
        [Array.from(descriptor)],
        [photoUrl] // Store URL instead of key
      );

      setNewStudentName("");
      setCapturedBlob(null);
      setCapturedImg(null);
      setAddStudentOpen(false);
      await refreshStudents();
      await refreshClasses();
      toast.success(`"${newStudentName.trim()}" сурагчийг бүртгэлээ`);
    } catch (error) {
      toast.error("Сурагч бүртгэхэд алдаа гарлаа");
      console.error(error);
    } finally {
      setProcessing(false);
    }
  };

  const handleDeleteStudent = async (student: Student) => {
    try {
      await deleteStudent(student.id);
      await refreshStudents();
      await refreshClasses();
      toast.success(`"${student.name}" сурагчийг устгалаа`);
    } catch (error) {
      toast.error("Сурагч устгахад алдаа гарлаа");
      console.error(error);
    }
  };

  // Fine-tune: add more photos to improve recognition
  const handleFineTuneCapture = async (
    blob: Blob,
    img: HTMLImageElement
  ) => {
    if (!fineTuneStudentId) return;
    setProcessing(true);
    try {
      if (!faceApiReady) await initFaceApi();

      const descriptor = await extractSingleDescriptor(img);
      if (!descriptor) {
        toast.error("Зургаас нүүр олдсонгүй");
        setProcessing(false);
        return;
      }

      const photoKey = `student-${crypto.randomUUID()}`;
      const photoUrl = await savePhoto(photoKey, blob);

      await addDescriptorToStudent(
        fineTuneStudentId,
        Array.from(descriptor),
        photoUrl
      );

      const student = students.find((s) => s.id === fineTuneStudentId);
      setFineTuneStudentId(null);
      await refreshStudents();
      toast.success(
        `"${student?.name}" сурагчийн нүүр таних чадварыг сайжруулах зураг нэмлээ`
      );
    } catch (error) {
      toast.error("Зураг нэмэхэд алдаа гарлаа");
      console.error(error);
    } finally {
      setProcessing(false);
    }
  };

  const selectedClass = classes.find((c) => c.id === selectedClassId);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Сурагчдын бүртгэл
        </h1>
        <p className="text-sm text-muted-foreground">
          Анги, сурагчдыг бүртгэх, нүүр таних зураг оруулах
        </p>
      </div>

      {/* Face-api loading indicator */}
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

      <Tabs defaultValue="students" className="w-full">
        <TabsList className="grid w-full grid-cols-2 sm:w-auto sm:grid-cols-none sm:flex">
          <TabsTrigger value="students" className="gap-2">
            <Users className="h-4 w-4" />
            Сурагчид
          </TabsTrigger>
          <TabsTrigger value="classes" className="gap-2">
            <BookOpen className="h-4 w-4" />
            Ангиуд
          </TabsTrigger>
        </TabsList>

        {/* Students Tab */}
        <TabsContent value="students" className="flex flex-col gap-4">
          {/* Class selector + add student */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Label className="text-foreground">Анги сонгох</Label>
              <Select
                value={selectedClassId}
                onValueChange={setSelectedClassId}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Анги сонгоно уу" />
                </SelectTrigger>
                <SelectContent>
                  {classes.map((cls) => (
                    <SelectItem key={cls.id} value={cls.id}>
                      {cls.name} ({cls.studentIds.length})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedClassId && (
              <Dialog open={addStudentOpen} onOpenChange={setAddStudentOpen}>
                <DialogTrigger asChild>
                  <Button
                    className="gap-2"
                    onClick={() => {
                      initFaceApi();
                      setAddStudentOpen(true);
                    }}
                  >
                    <Plus className="h-4 w-4" />
                    Сурагч нэмэх
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle className="text-foreground">
                      Шинэ сурагч бүртгэх
                    </DialogTitle>
                  </DialogHeader>
                  <div className="flex flex-col gap-4">
                    <div>
                      <Label htmlFor="student-name" className="text-foreground">
                        Сурагчийн нэр
                      </Label>
                      <Input
                        id="student-name"
                        value={newStudentName}
                        onChange={(e) => setNewStudentName(e.target.value)}
                        placeholder="Нэр оруулна уу"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-foreground">
                        Нүүрний зураг (нүүр тод харагдах)
                      </Label>
                      <div className="mt-1">
                        <CameraCapture
                          compact
                          onCapture={(blob, img) => {
                            setCapturedBlob(blob);
                            setCapturedImg(img);
                          }}
                        />
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <DialogClose asChild>
                      <Button variant="outline">Болих</Button>
                    </DialogClose>
                    <Button
                      onClick={handleAddStudent}
                      disabled={
                        processing ||
                        !newStudentName.trim() ||
                        !capturedBlob
                      }
                      className="gap-2"
                    >
                      {processing && (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      )}
                      Бүртгэх
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>

          {/* Students list */}
          {!selectedClassId ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-2 py-12">
                <BookOpen className="h-10 w-10 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">
                  {classes.length === 0
                    ? 'Эхлээд анги үүсгэнэ үү. "Ангиуд" таб руу очно уу.'
                    : "Анги сонгоно уу"}
                </p>
              </CardContent>
            </Card>
          ) : students.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-2 py-12">
                <Users className="h-10 w-10 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">
                  {`"${selectedClass?.name}" ангид сурагч байхгүй байна`}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {students.map((student) => (
                <Card key={student.id}>
                  <CardContent className="flex items-start gap-3 p-4">
                    <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
                      {studentPhotos[student.id] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={studentPhotos[student.id]}
                          alt={student.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <Users className="h-6 w-6 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="truncate font-medium text-foreground">
                        {student.name}
                      </p>
                      <div className="mt-1 flex items-center gap-2">
                        <Badge
                          variant="secondary"
                          className="text-xs bg-primary/10 text-primary"
                        >
                          <ScanFace className="mr-1 h-3 w-3" />
                          {student.descriptors.length} зураг
                        </Badge>
                      </div>
                      <div className="mt-2 flex gap-1">
                        {/* Fine tune button */}
                        <Dialog
                          open={fineTuneStudentId === student.id}
                          onOpenChange={(open) =>
                            setFineTuneStudentId(open ? student.id : null)
                          }
                        >
                          <DialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 gap-1 px-2 text-xs"
                              onClick={() => initFaceApi()}
                            >
                              <ImagePlus className="h-3 w-3" />
                              Зураг нэмэх
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle className="text-foreground">
                                {`"${student.name}" - Нүүр таних сайжруулах`}
                              </DialogTitle>
                            </DialogHeader>
                            <p className="text-sm text-muted-foreground">
                              Өөр өнцгөөс нүүрний зураг нэмснээр таних чадвар
                              сайжирна.
                            </p>
                            <CameraCapture
                              compact
                              onCapture={handleFineTuneCapture}
                            />
                            {processing && (
                              <div className="flex items-center gap-2">
                                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                                <p className="text-sm text-muted-foreground">
                                  Боловсруулж байна...
                                </p>
                              </div>
                            )}
                          </DialogContent>
                        </Dialog>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 gap-1 px-2 text-xs text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-3 w-3" />
                              Устгах
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle className="text-foreground">
                                Сурагч устгах
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                {`"${student.name}" сурагчийг устгахдаа итгэлтэй байна уу? Энэ үйлдлийг буцаах боломжгүй.`}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Болих</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDeleteStudent(student)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Устгах
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Classes Tab */}
        <TabsContent value="classes" className="flex flex-col gap-4">
          {/* Add class form */}
          <Card>
            <CardHeader>
              <CardTitle className="text-foreground">Шинэ анги нэмэх</CardTitle>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleAddClass();
                }}
                className="flex gap-2"
              >
                <Input
                  value={newClassName}
                  onChange={(e) => setNewClassName(e.target.value)}
                  placeholder="Ангийн нэр, жнь: 10А"
                  className="flex-1"
                />
                <Button type="submit" disabled={!newClassName.trim()}>
                  <Plus className="mr-1 h-4 w-4" />
                  Нэмэх
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Classes list */}
          {classes.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-2 py-12">
                <BookOpen className="h-10 w-10 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">
                  Анги үүсгэнэ үү
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {classes.map((cls) => (
                <Card key={cls.id}>
                  <CardContent className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                        <BookOpen className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium text-foreground">
                          {cls.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {cls.studentIds.length} сурагч
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Dialog
                        open={editingClass?.id === cls.id}
                        onOpenChange={(open) => {
                          if (open) {
                            setEditingClass(cls);
                            setEditClassName(cls.name);
                          } else {
                            setEditingClass(null);
                          }
                        }}
                      >
                        <DialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <Edit2 className="h-4 w-4" />
                            <span className="sr-only">Засах</span>
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle className="text-foreground">
                              Ангийн нэр засах
                            </DialogTitle>
                          </DialogHeader>
                          <Input
                            value={editClassName}
                            onChange={(e) => setEditClassName(e.target.value)}
                          />
                          <DialogFooter>
                            <DialogClose asChild>
                              <Button variant="outline">Болих</Button>
                            </DialogClose>
                            <Button onClick={handleUpdateClass}>
                              Хадгалах
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                            <span className="sr-only">Устгах</span>
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle className="text-foreground">
                              Анги устгах
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              {`"${cls.name}" анги болон доторх бүх сурагчид устгагдана. Энэ үйлдлийг буцаах боломжгүй.`}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Болих</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDeleteClass(cls)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Устгах
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
