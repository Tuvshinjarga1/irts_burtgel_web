"use client";

import { useState, useEffect, useMemo } from "react";
import {
  History,
  CalendarDays,
  BookOpen,
  CheckCircle,
  XCircle,
  Trash2,
  Eye,
  RefreshCcw
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { toast } from "sonner";
import {
  getClasses,
  getAttendanceRecords,
  getStudentsByClass,
  deleteAttendanceRecord,
  type AttendanceRecord,
  type ClassInfo,
  type Student,
} from "@/lib/storage";
import { getPhotoURL } from "@/lib/db";

export default function HistoryPage() {
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [filterClassId, setFilterClassId] = useState("all");
  const [filterDate, setFilterDate] = useState("");
  const [detailRecord, setDetailRecord] = useState<AttendanceRecord | null>(
    null
  );
  const [detailStudents, setDetailStudents] = useState<Student[]>([]);
  const [detailPhotoUrl, setDetailPhotoUrl] = useState<string | null>(null);

  const refreshData = async () => {
    try {
      const [cls, recs] = await Promise.all([
        getClasses(),
        getAttendanceRecords()
      ]);
      setClasses(cls);
      setRecords(
        recs.sort(
          (a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        )
      );
    } catch (e) {
      console.error(e);
      toast.error("Өгөгдөл татахад алдаа гарлаа");
    }
  };

  useEffect(() => {
    refreshData();
  }, []);

  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      if (filterClassId !== "all" && r.classId !== filterClassId) return false;
      if (filterDate && r.date !== filterDate) return false;
      return true;
    });
  }, [records, filterClassId, filterDate]);

  const getClassName = (classId: string) => {
    return classes.find((c) => c.id === classId)?.name || "Тодорхойгүй";
  };

  const getClassStudentCount = (classId: string) => {
    const cls = classes.find((c) => c.id === classId);
    return cls?.studentIds.length || 0;
  };

  const handleDelete = async (record: AttendanceRecord) => {
    try {
      await deleteAttendanceRecord(record.id);
      await refreshData();
      toast.success("Бүртгэл устгагдлаа");
    } catch {
      toast.error("Устгахад алдаа гарлаа");
    }
  };

  const handleViewDetail = async (record: AttendanceRecord) => {
    setDetailRecord(record);

    // Get students
    try {
      const classStudents = await getStudentsByClass(record.classId);
      setDetailStudents(classStudents);
    } catch {
      setDetailStudents([]);
    }

    // Get photo
    if (record.photoKey) {
      const url = await getPhotoURL(record.photoKey);
      setDetailPhotoUrl(url);
    } else {
      setDetailPhotoUrl(null);
    }
  };

  // Unique dates for quick filter
  const uniqueDates = useMemo(() => {
    const dates = [...new Set(records.map((r) => r.date))];
    return dates.sort((a, b) => b.localeCompare(a));
  }, [records]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Ирцийн түүх
        </h1>
        <p className="text-sm text-muted-foreground">
          Ирцийн бүртгэлийг огноо, ангиар шүүж харах
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Label className="text-foreground">Анги</Label>
              <Select value={filterClassId} onValueChange={setFilterClassId}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Бүх ангиуд</SelectItem>
                  {classes.map((cls) => (
                    <SelectItem key={cls.id} value={cls.id}>
                      {cls.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <Label className="text-foreground">Огноо</Label>
              <Input
                type="date"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                className="mt-1"
              />
            </div>
            {(filterClassId !== "all" || filterDate) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFilterClassId("all");
                  setFilterDate("");
                }}
              >
                <RefreshCcw className="mr-2 h-3 w-3" />
                Цэвэрлэх
              </Button>
            )}
          </div>
          {/* Quick date chips */}
          {uniqueDates.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {uniqueDates.slice(0, 7).map((date) => (
                <Badge
                  key={date}
                  variant={filterDate === date ? "default" : "secondary"}
                  className="cursor-pointer"
                  onClick={() =>
                    setFilterDate(filterDate === date ? "" : date)
                  }
                >
                  <CalendarDays className="mr-1 h-3 w-3" />
                  {new Date(date + "T00:00:00").toLocaleDateString("mn-MN")}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Records table */}
      {filteredRecords.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12">
            <History className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              {records.length === 0
                ? "Ирцийн бүртгэл одоогоор байхгүй байна"
                : "Шүүлтэд тохирох бүртгэл олдсонгүй"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-foreground">
              <span>
                Бүртгэлүүд ({filteredRecords.length})
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Огноо</TableHead>
                  <TableHead>Цаг</TableHead>
                  <TableHead>Анги</TableHead>
                  <TableHead>Ирсэн</TableHead>
                  <TableHead>Танигдаагүй</TableHead>
                  <TableHead className="text-right">Үйлдэл</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRecords.map((record) => {
                  const total = getClassStudentCount(record.classId);
                  const present = record.presentStudentIds.length;
                  const rate =
                    total > 0 ? Math.round((present / total) * 100) : 0;

                  return (
                    <TableRow key={record.id}>
                      <TableCell className="font-medium text-foreground">
                        {new Date(
                          record.date + "T00:00:00"
                        ).toLocaleDateString("mn-MN")}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(record.timestamp).toLocaleTimeString(
                          "mn-MN",
                          { hour: "2-digit", minute: "2-digit" }
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="bg-primary/10 text-primary">
                          <BookOpen className="mr-1 h-3 w-3" />
                          {getClassName(record.classId)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-foreground font-medium">
                          {present}/{total}
                        </span>
                        <span className="ml-1 text-xs text-muted-foreground">
                          ({rate}%)
                        </span>
                      </TableCell>
                      <TableCell>
                        {record.unrecognizedFaces.length > 0 ? (
                          <Badge
                            variant="secondary"
                            className="bg-warning/10 text-warning"
                          >
                            {record.unrecognizedFaces.length}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            0
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleViewDetail(record)}
                          >
                            <Eye className="h-4 w-4" />
                            <span className="sr-only">Дэлгэрэнгүй</span>
                          </Button>
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
                                  Бүртгэл устгах
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  Энэ ирцийн бүртгэлийг устгахдаа итгэлтэй
                                  байна уу?
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Болих</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDelete(record)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Устгах
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Detail Dialog */}
      <Dialog
        open={!!detailRecord}
        onOpenChange={(open) => !open && setDetailRecord(null)}
      >
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              Ирцийн дэлгэрэнгүй
            </DialogTitle>
          </DialogHeader>

          {detailRecord && (
            <div className="flex flex-col gap-4">
              {/* Meta */}
              <div className="flex flex-wrap gap-3">
                <Badge variant="secondary" className="bg-primary/10 text-primary">
                  <BookOpen className="mr-1 h-3 w-3" />
                  {getClassName(detailRecord.classId)}
                </Badge>
                <Badge variant="secondary">
                  <CalendarDays className="mr-1 h-3 w-3" />
                  {new Date(
                    detailRecord.timestamp
                  ).toLocaleString("mn-MN")}
                </Badge>
              </div>

              {/* Photo */}
              {detailPhotoUrl && (
                <div className="overflow-hidden rounded-lg border border-border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={detailPhotoUrl}
                    alt="Ирцийн зураг"
                    className="w-full object-contain"
                  />
                </div>
              )}

              {/* Student attendance list */}
              <div>
                <h4 className="mb-2 text-sm font-medium text-foreground">
                  Сурагчдын жагсаалт
                </h4>
                <div className="flex flex-col gap-1">
                  {detailStudents.map((student) => {
                    const isPresent =
                      detailRecord.presentStudentIds.includes(student.id);
                    return (
                      <div
                        key={student.id}
                        className="flex items-center gap-2 rounded-lg px-3 py-2"
                      >
                        {isPresent ? (
                          <CheckCircle className="h-4 w-4 text-success" />
                        ) : (
                          <XCircle className="h-4 w-4 text-destructive" />
                        )}
                        <span
                          className={
                            isPresent
                              ? "text-sm text-foreground"
                              : "text-sm text-muted-foreground"
                          }
                        >
                          {student.name}
                        </span>
                        <Badge
                          variant="secondary"
                          className={
                            isPresent
                              ? "ml-auto bg-success/10 text-success text-xs"
                              : "ml-auto bg-destructive/10 text-destructive text-xs"
                          }
                        >
                          {isPresent ? "Ирсэн" : "Ирээгүй"}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
