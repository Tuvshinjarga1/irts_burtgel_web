import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AppNavigation } from "@/components/app-navigation";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/components/auth-provider";
import { RouteGuard } from "@/components/route-guard";

const _inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Ирц бүртгэл - AI Face Recognition",
  description:
    "Багш нар сурагчдынхаа ирцийг зураг дарж хиймэл оюуныг ашиглан автомат бүртгэдэг систем",
};

export const viewport: Viewport = {
  themeColor: "#2563EB",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="mn">
      <body className="font-sans antialiased min-h-screen bg-background text-foreground">
        <AuthProvider>
          <RouteGuard>
            <AppNavigation />
            <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
              {children}
            </main>
          </RouteGuard>
          <Toaster />
        </AuthProvider>
      </body>
    </html>
  );
}
