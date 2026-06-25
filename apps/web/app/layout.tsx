import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ConvexAuthNextjsServerProvider } from "@convex-dev/auth/nextjs/server";

import { ConvexClientProvider } from "@/components/convex-client-provider";
import { PUBLIC_CONVEX_URL } from "@/lib/convex-env";
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
        <ConvexAuthNextjsServerProvider storageNamespace={PUBLIC_CONVEX_URL}>
          <ThemeProvider>
            <ConvexClientProvider>{children}</ConvexClientProvider>
          </ThemeProvider>
        </ConvexAuthNextjsServerProvider>
      </body>
    </html>
  );
}
