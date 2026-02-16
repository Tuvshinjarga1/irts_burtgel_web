"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Camera,
  Users,
  CalendarCheck,
  History,
  TrendingUp,
  BookOpen,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  getClasses,
  getStudents,
  getAttendanceRecords,
  type AttendanceRecord,
  type ClassInfo,
} from "@/lib/storage";

export default function DashboardPage() {
  const [stats, setStats] = useState({
    totalStudents: 0,
    totalClasses: 0,
    todayAttendance: 0,
    todayTotal: 0,
    totalRecords: 0,
  });
  const [recentRecords, setRecentRecords] = useState<
    (AttendanceRecord & { className: string })[]
  >([]);
  const [classes, setClasses] = useState<ClassInfo[]>([]);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [allClasses, allStudents, allRecords] = await Promise.all([
          getClasses(),
          getStudents(),
          getAttendanceRecords(),
        ]);

        const today = new Date().toISOString().split("T")[0];

        const todayRecords = allRecords.filter((r) => r.date === today);
        const todayPresent = new Set<string>();
        const todayClassStudents = new Set<string>();
        for (const r of todayRecords) {
          for (const sid of r.presentStudentIds) todayPresent.add(sid);
          const cls = allClasses.find((c) => c.id === r.classId);
          if (cls) {
            for (const sid of cls.studentIds) todayClassStudents.add(sid);
          }
        }

        setStats({
          totalStudents: allStudents.length,
          totalClasses: allClasses.length,
          todayAttendance: todayPresent.size,
          todayTotal: todayClassStudents.size || allStudents.length,
          totalRecords: allRecords.length,
        });

        const recent = allRecords
          .sort(
            (a, b) =>
              new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          )
          .slice(0, 5)
          .map((r) => ({
            ...r,
            className:
              allClasses.find((c) => c.id === r.classId)?.name || "Тодорхойгүй",
          }));

        setRecentRecords(recent);
        setClasses(allClasses);
      } catch (error) {
        console.error("Error loading dashboard data:", error);
      }
    };

    loadData();
  }, []);

  const attendanceRate =
    stats.todayTotal > 0
      ? Math.round((stats.todayAttendance / stats.todayTotal) * 100)
      : 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Хянах самбар
          </h1>
          <p className="text-sm text-muted-foreground">
            Ирцийн бүртгэлийн товч мэдээлэл
          </p>
        </div>
        <Button asChild>
          <Link href="/attendance" className="gap-2">
            <Camera className="h-4 w-4" />
            Ирц бүртгэх
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Нийт сурагч
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-foreground">
              {stats.totalStudents}
            </p>
            <p className="text-xs text-muted-foreground">
              {stats.totalClasses} ангид
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Өнөөдрийн ирц
            </CardTitle>
            <CalendarCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-foreground">
              {stats.todayAttendance}
              <span className="text-lg font-normal text-muted-foreground">
                {" / "}
                {stats.todayTotal}
              </span>
            </p>
            <p className="text-xs text-muted-foreground">
              {attendanceRate}% ирсэн
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Нийт ангиуд
            </CardTitle>
            <BookOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-foreground">
              {stats.totalClasses}
            </p>
            <p className="text-xs text-muted-foreground">Идэвхтэй ангиуд</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Нийт бүртгэл
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-foreground">
              {stats.totalRecords}
            </p>
            <p className="text-xs text-muted-foreground">
              Ирцийн бүртгэлийн тоо
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-foreground">Хурдан үйлдлүүд</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Button
              asChild
              variant="outline"
              className="h-auto justify-start gap-3 py-3"
            >
              <Link href="/attendance">
                <Camera className="h-5 w-5 text-primary" />
                <div className="text-left">
                  <p className="font-medium text-foreground">Ирц бүртгэх</p>
                  <p className="text-xs text-muted-foreground">
                    Камераар зураг авч ирцийг бүртгэх
                  </p>
                </div>
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="h-auto justify-start gap-3 py-3"
            >
              <Link href="/students">
                <Users className="h-5 w-5 text-primary" />
                <div className="text-left">
                  <p className="font-medium text-foreground">
                    Сурагч бүртгэх
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Шинэ сурагч нэмэх, зураг оруулах
                  </p>
                </div>
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="h-auto justify-start gap-3 py-3"
            >
              <Link href="/history">
                <History className="h-5 w-5 text-primary" />
                <div className="text-left">
                  <p className="font-medium text-foreground">Ирцийн түүх</p>
                  <p className="text-xs text-muted-foreground">
                    Ирцийн бүртгэлийг огноогоор харах
                  </p>
                </div>
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-foreground">
              Сүүлийн бүртгэлүүд
            </CardTitle>
            {recentRecords.length > 0 && (
              <Button variant="ghost" size="sm" asChild>
                <Link href="/history">Бүгдийг харах</Link>
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {recentRecords.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <CalendarCheck className="h-10 w-10 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">
                  Ирцийн бүртгэл одоогоор байхгүй байна
                </p>
                <Button variant="outline" size="sm" asChild>
                  <Link href="/attendance">Ирц бүртгэх</Link>
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {recentRecords.map((record) => (
                  <div
                    key={record.id}
                    className="flex items-center justify-between rounded-lg border border-border px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {record.className}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(record.timestamp).toLocaleString("mn-MN")}
                      </p>
                    </div>
                    <Badge
                      variant="secondary"
                      className="bg-primary/10 text-primary"
                    >
                      {record.presentStudentIds.length} ирсэн
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {classes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-foreground">
              Ангиудын жагсаалт
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {classes.map((cls) => (
                <div
                  key={cls.id}
                  className="flex items-center justify-between rounded-lg border border-border px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                      <BookOpen className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {cls.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {cls.studentIds.length} сурагч
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
