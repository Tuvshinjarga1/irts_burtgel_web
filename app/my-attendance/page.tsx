"use client";

import { useEffect, useState, useMemo } from "react";
import {
  CalendarCheck,
  CalendarDays,
  CheckCircle,
  XCircle,
  TrendingUp,
  BookOpen,
  GraduationCap,
  AlertCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { useAuth } from "@/components/auth-provider";
import {
  getAttendanceRecords,
  getClasses,
  getStudentById,
  getStudents,
  type AttendanceRecord,
  type ClassInfo,
  type Student,
} from "@/lib/storage";

export default function MyAttendancePage() {
  const { user } = useAuth();
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [linkedStudent, setLinkedStudent] = useState<Student | null>(null);
  const [filterMonth, setFilterMonth] = useState("");

  // If student doesn't have a linked studentId, try to find them by name
  const [matchedStudentId, setMatchedStudentId] = useState<string | null>(null);
  const [manualStudentId, setManualStudentId] = useState("");
  const [allStudents, setAllStudents] = useState<Student[]>([]);

  useEffect(() => {
    if (!user) return;

    const allClasses = getClasses();
    setClasses(allClasses);

    const allRecs = getAttendanceRecords().sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    setRecords(allRecs);

    // Try to find linked student
    if (user.studentId) {
      const student = getStudentById(user.studentId);
      setLinkedStudent(student || null);
      setMatchedStudentId(user.studentId);
    } else {
      // Try matching by name
      const students = getStudents();
      setAllStudents(students);
      const nameMatch = students.find(
        (s) => s.name.toLowerCase() === user.name.toLowerCase()
      );
      if (nameMatch) {
        setMatchedStudentId(nameMatch.id);
        setLinkedStudent(nameMatch);
      }
    }
  }, [user]);

  const effectiveStudentId = matchedStudentId || manualStudentId;

  // Filter records where this student was in the class
  const myRecords = useMemo(() => {
    if (!effectiveStudentId) return [];
    return records.filter((r) => {
      // Check if the student's class matches
      const cls = classes.find((c) => c.id === r.classId);
      return cls?.studentIds.includes(effectiveStudentId);
    });
  }, [records, classes, effectiveStudentId]);

  // Further filter by month
  const filteredRecords = useMemo(() => {
    if (!filterMonth) return myRecords;
    return myRecords.filter((r) => r.date.startsWith(filterMonth));
  }, [myRecords, filterMonth]);

  // Stats
  const stats = useMemo(() => {
    if (!effectiveStudentId || myRecords.length === 0) {
      return { total: 0, present: 0, absent: 0, rate: 0 };
    }
    const total = myRecords.length;
    const present = myRecords.filter((r) =>
      r.presentStudentIds.includes(effectiveStudentId)
    ).length;
    return {
      total,
      present,
      absent: total - present,
      rate: total > 0 ? Math.round((present / total) * 100) : 0,
    };
  }, [myRecords, effectiveStudentId]);

  const getClassName = (classId: string) => {
    return classes.find((c) => c.id === classId)?.name || "Тодорхойгүй";
  };

  // Unique months for filter
  const uniqueMonths = useMemo(() => {
    const months = [
      ...new Set(myRecords.map((r) => r.date.substring(0, 7))),
    ];
    return months.sort((a, b) => b.localeCompare(a));
  }, [myRecords]);

  if (!user) return null;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Миний ирц
        </h1>
        <p className="text-sm text-muted-foreground">
          {user.name} - Ирцийн мэдээлэл
        </p>
      </div>

      {/* Not linked warning */}
      {!effectiveStudentId && (
        <Card className="border-warning/30 bg-warning/5">
          <CardContent className="py-4">
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-warning" />
                <p className="text-sm font-medium text-foreground">
                  Таны бүртгэл сурагчийн мэдээлэлтэй холбогдоогүй байна
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                Доорх жагсаалтаас өөрийгөө сонгоно уу. Багш таны зургийг
                бүртгэсний дараа ирцийн мэдээлэл харагдана.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <Label className="text-foreground">Сурагч сонгох</Label>
                  <Select
                    value={manualStudentId}
                    onValueChange={(v) => {
                      setManualStudentId(v);
                      const s = allStudents.find((s) => s.id === v);
                      setLinkedStudent(s || null);
                    }}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Өөрийгөө сонгоно уу" />
                    </SelectTrigger>
                    <SelectContent>
                      {allStudents.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Student info */}
      {linkedStudent && (
        <Card>
          <CardContent className="flex items-center gap-4 py-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10">
              <GraduationCap className="h-6 w-6 text-accent" />
            </div>
            <div>
              <p className="font-medium text-foreground">{linkedStudent.name}</p>
              <p className="text-sm text-muted-foreground">
                {linkedStudent.classId
                  ? getClassName(linkedStudent.classId)
                  : "Анги тодорхойгүй"}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      {effectiveStudentId && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Нийт хичээл
              </CardTitle>
              <BookOpen className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-foreground">
                {stats.total}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Ирсэн
              </CardTitle>
              <CheckCircle className="h-4 w-4 text-success" />
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-success">
                {stats.present}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Ирээгүй
              </CardTitle>
              <XCircle className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-destructive">
                {stats.absent}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Ирцийн хувь
              </CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p
                className={`text-3xl font-bold ${
                  stats.rate >= 80
                    ? "text-success"
                    : stats.rate >= 60
                      ? "text-warning"
                      : "text-destructive"
                }`}
              >
                {stats.rate}%
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Attendance records */}
      {effectiveStudentId && (
        <>
          {/* Filters */}
          <Card>
            <CardContent className="py-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <Label className="text-foreground">Сараар шүүх</Label>
                  <Input
                    type="month"
                    value={filterMonth}
                    onChange={(e) => setFilterMonth(e.target.value)}
                    className="mt-1"
                  />
                </div>
                {filterMonth && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setFilterMonth("")}
                  >
                    Цэвэрлэх
                  </Button>
                )}
              </div>
              {uniqueMonths.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {uniqueMonths.slice(0, 6).map((month) => (
                    <Badge
                      key={month}
                      variant={filterMonth === month ? "default" : "secondary"}
                      className="cursor-pointer"
                      onClick={() =>
                        setFilterMonth(filterMonth === month ? "" : month)
                      }
                    >
                      <CalendarDays className="mr-1 h-3 w-3" />
                      {month}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {filteredRecords.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-2 py-12">
                <CalendarCheck className="h-10 w-10 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">
                  Ирцийн бүртгэл олдсонгүй
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-foreground">
                  Ирцийн бүртгэл ({filteredRecords.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Огноо</TableHead>
                      <TableHead>Цаг</TableHead>
                      <TableHead>Анги</TableHead>
                      <TableHead>Ирц</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRecords.map((record) => {
                      const isPresent = record.presentStudentIds.includes(
                        effectiveStudentId
                      );
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
                            <Badge
                              variant="secondary"
                              className="bg-primary/10 text-primary"
                            >
                              <BookOpen className="mr-1 h-3 w-3" />
                              {getClassName(record.classId)}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {isPresent ? (
                              <Badge
                                variant="secondary"
                                className="bg-success/10 text-success"
                              >
                                <CheckCircle className="mr-1 h-3 w-3" />
                                Ирсэн
                              </Badge>
                            ) : (
                              <Badge
                                variant="secondary"
                                className="bg-destructive/10 text-destructive"
                              >
                                <XCircle className="mr-1 h-3 w-3" />
                                Ирээгүй
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* No student linked and no manual selection */}
      {!effectiveStudentId && allStudents.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12">
            <GraduationCap className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              Багш сурагчдыг бүртгээгүй байна. Багштайгаа холбогдоно уу.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
