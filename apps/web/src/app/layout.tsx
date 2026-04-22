import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { FetchBasePath } from "@/components/providers/fetch-base-path";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "PusulaHub - Sunucu Yonetim Paneli",
  description: "Windows ve Linux sunucu yonetim platformu",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="tr" suppressHydrationWarning>
      <body className={inter.className} suppressHydrationWarning>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
          <FetchBasePath />
          <TooltipProvider>
            {children}
          </TooltipProvider>
          <Toaster position="top-center" />
        </ThemeProvider>
      </body>
    </html>
  );
}
