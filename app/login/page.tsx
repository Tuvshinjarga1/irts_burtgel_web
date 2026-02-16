"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ScanFace, Loader2, GraduationCap, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";
import { getClasses, getStudentsByClass, type Student } from "@/lib/storage";
import type { UserRole } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const { login, register } = useAuth();

  // Login state
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  // Register state
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regRole, setRegRole] = useState<UserRole>("teacher");
  const [regClassId, setRegClassId] = useState("");
  const [regStudentId, setRegStudentId] = useState("");
  const [regLoading, setRegLoading] = useState(false);

  const [classes, setClasses] = useState<any[]>([]);
  const [classStudents, setClassStudents] = useState<Student[]>([]);

  useEffect(() => {
    getClasses().then(setClasses);
  }, []);

  useEffect(() => {
    if (regClassId) {
      getStudentsByClass(regClassId).then(setClassStudents);
    } else {
      setClassStudents([]);
    }
  }, [regClassId]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail.trim() || !loginPassword.trim()) return;
    setLoginLoading(true);
    const result = await login(loginEmail.trim(), loginPassword.trim());
    setLoginLoading(false);
    if (result.success) {
      toast.success("Амжилттай нэвтэрлээ");
      router.push("/");
    } else {
      toast.error(result.error || "Нэвтрэх боломжгүй");
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regName.trim() || !regEmail.trim() || !regPassword.trim()) return;
    if (regPassword.length < 6) {
      toast.error("Нууц үг хамгийн багадаа 6 тэмдэгт байна");
      return;
    }

    setRegLoading(true);
    const result = await register(
      regName.trim(),
      regEmail.trim(),
      regPassword.trim(),
      regRole,
      regRole === "student" ? regStudentId || undefined : undefined,
      regRole === "student" ? regClassId || undefined : undefined
    );
    setRegLoading(false);
    if (result.success) {
      toast.success("Бүртгэл амжилттай. Нэвтэрлээ!");
      router.push("/");
    } else {
      toast.error(result.error || "Бүртгэл амжилтгүй");
    }
  };

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary">
            <ScanFace className="h-8 w-8 text-primary-foreground" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight text-foreground text-balance">
              Ирц бүртгэлийн систем
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              AI нүүр таних технологи
            </p>
          </div>
        </div>

        <Card>
          <Tabs defaultValue="login">
            <CardHeader className="pb-3">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">Нэвтрэх</TabsTrigger>
                <TabsTrigger value="register">Бүртгүүлэх</TabsTrigger>
              </TabsList>
            </CardHeader>

            <CardContent>
              {/* Login Tab */}
              <TabsContent value="login" className="mt-0">
                <form onSubmit={handleLogin} className="flex flex-col gap-4">
                  <div>
                    <Label htmlFor="login-email" className="text-foreground">
                      Имэйл хаяг
                    </Label>
                    <Input
                      id="login-email"
                      type="email"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      placeholder="example@email.com"
                      className="mt-1"
                      autoComplete="email"
                    />
                  </div>
                  <div>
                    <Label htmlFor="login-password" className="text-foreground">
                      Нууц үг
                    </Label>
                    <Input
                      id="login-password"
                      type="password"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="Нууц үг"
                      className="mt-1"
                      autoComplete="current-password"
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={
                      loginLoading ||
                      !loginEmail.trim() ||
                      !loginPassword.trim()
                    }
                    className="w-full gap-2"
                  >
                    {loginLoading && (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    )}
                    Нэвтрэх
                  </Button>
                </form>
              </TabsContent>

              {/* Register Tab */}
              <TabsContent value="register" className="mt-0">
                <form
                  onSubmit={handleRegister}
                  className="flex flex-col gap-4"
                >
                  <div>
                    <Label htmlFor="reg-name" className="text-foreground">
                      Нэр
                    </Label>
                    <Input
                      id="reg-name"
                      value={regName}
                      onChange={(e) => setRegName(e.target.value)}
                      placeholder="Таны нэр"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="reg-email" className="text-foreground">
                      Имэйл хаяг
                    </Label>
                    <Input
                      id="reg-email"
                      type="email"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      placeholder="example@email.com"
                      className="mt-1"
                      autoComplete="email"
                    />
                  </div>
                  <div>
                    <Label htmlFor="reg-password" className="text-foreground">
                      Нууц үг
                    </Label>
                    <Input
                      id="reg-password"
                      type="password"
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      placeholder="6+ тэмдэгт"
                      className="mt-1"
                      autoComplete="new-password"
                    />
                  </div>
                  <div>
                    <Label className="text-foreground">Эрх</Label>
                    <Select
                      value={regRole}
                      onValueChange={(v) => {
                        setRegRole(v as UserRole);
                        setRegClassId("");
                        setRegStudentId("");
                      }}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="teacher">
                          <div className="flex items-center gap-2">
                            <ShieldCheck className="h-4 w-4 text-primary" />
                            Багш
                          </div>
                        </SelectItem>
                        <SelectItem value="student">
                          <div className="flex items-center gap-2">
                            <GraduationCap className="h-4 w-4 text-accent" />
                            Сурагч
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Student-specific fields */}
                  {regRole === "student" && (
                    <>
                      <div>
                        <Label className="text-foreground">
                          Анги (заавал биш)
                        </Label>
                        <Select
                          value={regClassId}
                          onValueChange={(v) => {
                            setRegClassId(v);
                            setRegStudentId("");
                          }}
                        >
                          <SelectTrigger className="mt-1">
                            <SelectValue placeholder="Анги сонгох" />
                          </SelectTrigger>
                          <SelectContent>
                            {classes.map((cls) => (
                              <SelectItem key={cls.id} value={cls.id}>
                                {cls.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Багш таны ангийг бүртгэсэн бол энд сонгоно уу
                        </p>
                      </div>
                      {regClassId && classStudents.length > 0 && (
                        <div>
                          <Label className="text-foreground">
                            Сурагчийн бүртгэлтэй холбох (заавал биш)
                          </Label>
                          <Select
                            value={regStudentId}
                            onValueChange={setRegStudentId}
                          >
                            <SelectTrigger className="mt-1">
                              <SelectValue placeholder="Өөрийгөө сонгох" />
                            </SelectTrigger>
                            <SelectContent>
                              {classStudents.map((s) => (
                                <SelectItem key={s.id} value={s.id}>
                                  {s.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </>
                  )}

                  <Button
                    type="submit"
                    disabled={
                      regLoading ||
                      !regName.trim() ||
                      !regEmail.trim() ||
                      !regPassword.trim()
                    }
                    className="w-full gap-2"
                  >
                    {regLoading && (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    )}
                    Бүртгүүлэх
                  </Button>
                </form>
              </TabsContent>
            </CardContent>
          </Tabs>
        </Card>
      </div>
    </div>
  );
}
