import type { Metadata } from "next";
import type { ReactNode } from "react";

import { SoftwareProcessingProvider } from "@/components/software-processing-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { cn } from "@workspace/ui/lib/utils";

import "./globals.css";

export const metadata: Metadata = {
  title: "Mrmpl Dashboard",
  description: "Mrmpl Production Dashboard",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={cn("antialiased", "font-sans")}>
      <body className={cn("min-h-svh antialiased")}>
        <ThemeProvider>
          <SoftwareProcessingProvider>{children}</SoftwareProcessingProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
