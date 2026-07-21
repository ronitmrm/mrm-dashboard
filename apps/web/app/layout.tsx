import type { Metadata } from "next";
import type { ReactNode } from "react";

import { ThemeProvider } from "@/components/theme-provider";
import { cn } from "@workspace/ui/lib/utils";

import "./globals.css";

export const metadata: Metadata = {
  title: "MRMPL Dashboard",
  description: "MRMPL production dashboard",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={cn("antialiased", "font-sans")}>
      <body className={cn("min-h-svh antialiased")}>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
