import type { Metadata } from "next"
import { Hind, Hind_Vadodara, Outfit } from "next/font/google"
import type { ReactNode } from "react"

import { SoftwareProcessingProvider } from "@/components/software-processing-provider"
import { ThemeProvider } from "@/components/theme-provider"
import { cn } from "@workspace/ui/lib/utils"

import "./globals.css"

const outfit = Outfit({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-outfit",
})

const hindVadodara = Hind_Vadodara({
  display: "swap",
  subsets: ["gujarati", "latin"],
  variable: "--font-hind-vadodara",
  weight: ["400", "500", "600", "700"],
})

const hind = Hind({
  display: "swap",
  subsets: ["devanagari", "latin"],
  variable: "--font-hind",
  weight: ["400", "500", "600", "700"],
})
export const metadata: Metadata = {
  title: "Mrmpl Dashboard",
  description: "Mrmpl Production Dashboard",
}

export default async function RootLayout({
  children,
}: {
  children: ReactNode
}) {
  return (
    <html
      lang="en-GB"
      suppressHydrationWarning
      className={cn(
        "font-sans antialiased",
        outfit.variable,
        hindVadodara.variable,
        hind.variable
      )}
    >
      <body className={cn("min-h-svh antialiased")}>
        <ThemeProvider>
          <SoftwareProcessingProvider>{children}</SoftwareProcessingProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
