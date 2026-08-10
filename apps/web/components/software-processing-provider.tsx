"use client"

import { useEffect, useSyncExternalStore, type ReactNode } from "react"
import { LoaderCircle } from "lucide-react"

import {
  createSoftwareProcessingFetch,
  softwareProcessingSnapshot,
  subscribeToSoftwareProcessing,
} from "@/lib/software-processing"

export function SoftwareProcessingProvider({ children }: { children: ReactNode }) {
  const isProcessing = useSyncExternalStore(
    subscribeToSoftwareProcessing,
    softwareProcessingSnapshot,
    () => false
  )

  useEffect(() => {
    const originalFetch = window.fetch
    const trackedFetch = createSoftwareProcessingFetch(originalFetch)
    window.fetch = trackedFetch
    return () => {
      if (window.fetch === trackedFetch) window.fetch = originalFetch
    }
  }, [])

  return (
    <>
      {isProcessing ? (
        <div
          aria-atomic="true"
          aria-live="assertive"
          className="fixed inset-0 z-[200] flex items-start justify-center bg-background/50 px-4 pt-20 backdrop-blur-[1px]"
          role="status"
        >
          <div className="flex max-w-md items-center gap-3 rounded-xl border bg-background px-4 py-3 shadow-lg">
            <span aria-hidden="true" className="animate-spin text-primary">
              <LoaderCircle className="size-5" />
            </span>
            <div>
              <p className="font-medium">Processing Your Request…</p>
              <p className="text-sm text-muted-foreground">
                Please Wait. All Software Controls Are Locked Until Saving Or Importing Finishes.
              </p>
            </div>
          </div>
        </div>
      ) : null}
      <div aria-busy={isProcessing} inert={isProcessing ? true : undefined}>
        {children}
      </div>
    </>
  )
}
