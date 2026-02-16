"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/components/auth-provider";

const PUBLIC_PATHS = ["/login"];
const TEACHER_PATHS = ["/", "/students", "/attendance", "/history"];
const STUDENT_PATHS = ["/my-attendance"];

export function RouteGuard({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    const isPublic = PUBLIC_PATHS.includes(pathname);

    if (!user && !isPublic) {
      router.replace("/login");
      return;
    }

    if (user && isPublic) {
      // Redirect away from login
      router.replace(user.role === "teacher" ? "/" : "/my-attendance");
      return;
    }

    if (user) {
      // Role-based access
      if (user.role === "student" && TEACHER_PATHS.includes(pathname)) {
        router.replace("/my-attendance");
        return;
      }
      if (user.role === "teacher" && STUDENT_PATHS.includes(pathname)) {
        router.replace("/");
        return;
      }
    }
  }, [user, loading, pathname, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Уншиж байна...</p>
        </div>
      </div>
    );
  }

  // Don't render content if not authorized
  const isPublic = PUBLIC_PATHS.includes(pathname);
  if (!user && !isPublic) return null;
  if (user && isPublic) return null;
  if (user?.role === "student" && TEACHER_PATHS.includes(pathname)) return null;
  if (user?.role === "teacher" && STUDENT_PATHS.includes(pathname)) return null;

  return <>{children}</>;
}
