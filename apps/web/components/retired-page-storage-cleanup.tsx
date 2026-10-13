"use client"

import { useEffect } from "react"
import { clearRetiredPageStorage } from "@/lib/retired-page-storage"

export function RetiredPageStorageCleanup() {
  useEffect(() => {
    for (const name of ["localStorage", "sessionStorage"] as const) {
      try {
        clearRetiredPageStorage(window[name])
      } catch {
        // Storage may be disabled by the browser.
      }
    }
  }, [])
  return null
}
