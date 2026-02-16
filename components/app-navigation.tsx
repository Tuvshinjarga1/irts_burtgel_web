"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Camera,
  Users,
  LayoutDashboard,
  History,
  ScanFace,
  Menu,
  X,
  LogOut,
  GraduationCap,
  CalendarCheck,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/components/auth-provider";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const teacherNavItems: NavItem[] = [
  { href: "/", label: "Хянах самбар", icon: LayoutDashboard },
  { href: "/students", label: "Сурагчид", icon: Users },
  { href: "/attendance", label: "Ирц бүртгэх", icon: Camera },
  { href: "/history", label: "Ирцийн түүх", icon: History },
];

const studentNavItems: NavItem[] = [
  { href: "/my-attendance", label: "Миний ирц", icon: CalendarCheck },
];

export function AppNavigation() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, logout } = useAuth();

  if (!user) return null;

  const navItems =
    user.role === "teacher" ? teacherNavItems : studentNavItems;

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-card">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        <Link href={user.role === "teacher" ? "/" : "/my-attendance"} className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
            <ScanFace className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="text-lg font-bold text-foreground">
            Ирц бүртгэл
          </span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden items-center gap-4 md:flex">
          <ul className="flex items-center gap-1">
            {navItems.map((item) => {
              const active = pathname === item.href;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      active
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>

          {/* User info + logout */}
          <div className="flex items-center gap-3 border-l border-border pl-4">
            <div className="flex items-center gap-2">
              {user.role === "teacher" ? (
                <ShieldCheck className="h-4 w-4 text-primary" />
              ) : (
                <GraduationCap className="h-4 w-4 text-accent" />
              )}
              <span className="text-sm font-medium text-foreground">
                {user.name}
              </span>
              <Badge
                variant="secondary"
                className={cn(
                  "text-xs",
                  user.role === "teacher"
                    ? "bg-primary/10 text-primary"
                    : "bg-accent/10 text-accent"
                )}
              >
                {user.role === "teacher" ? "Багш" : "Сурагч"}
              </Badge>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={logout}
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              aria-label="Гарах"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Mobile menu button */}
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Цэс нээх"
        >
          {mobileOpen ? (
            <X className="h-5 w-5" />
          ) : (
            <Menu className="h-5 w-5" />
          )}
        </Button>
      </nav>

      {/* Mobile nav */}
      {mobileOpen && (
        <div className="border-t border-border px-4 pb-4 md:hidden">
          {/* User info */}
          <div className="flex items-center gap-2 border-b border-border py-3">
            {user.role === "teacher" ? (
              <ShieldCheck className="h-4 w-4 text-primary" />
            ) : (
              <GraduationCap className="h-4 w-4 text-accent" />
            )}
            <span className="text-sm font-medium text-foreground">
              {user.name}
            </span>
            <Badge
              variant="secondary"
              className={cn(
                "text-xs",
                user.role === "teacher"
                  ? "bg-primary/10 text-primary"
                  : "bg-accent/10 text-accent"
              )}
            >
              {user.role === "teacher" ? "Багш" : "Сурагч"}
            </Badge>
          </div>

          <ul className="flex flex-col gap-1 pt-2">
            {navItems.map((item) => {
              const active = pathname === item.href;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      active
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
            <li>
              <button
                onClick={() => {
                  setMobileOpen(false);
                  logout();
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <LogOut className="h-4 w-4" />
                Гарах
              </button>
            </li>
          </ul>
        </div>
      )}
    </header>
  );
}
