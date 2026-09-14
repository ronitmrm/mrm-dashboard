"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@workspace/ui/components/button"
import { Dialog, DialogFooter } from "@workspace/ui/components/dialog"
import { StandardDialogContent } from "@/components/ui/golden-patterns"

export function MasterDataUnsavedGuard({
  enabled = true,
}: {
  enabled?: boolean
}) {
  const dirty = useRef(false)
  const [destination, setDestination] = useState<string | null>(null)
  useEffect(() => {
    if (!enabled) return
    dirty.current = false

    const markDirty = (event: Event) => {
      const target = event.target
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLSelectElement ||
        target instanceof HTMLTextAreaElement
      ) {
        if (target.form) dirty.current = true
      }
    }
    const markSaved = () => {
      dirty.current = false
    }
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty.current) return
      event.preventDefault()
    }
    const guardLink = (event: MouseEvent) => {
      if (!dirty.current || !(event.target instanceof Element)) return
      const link = event.target.closest<HTMLAnchorElement>("a[href]")
      if (!link || link.target === "_blank" || link.hasAttribute("download")) return
      event.preventDefault()
      event.stopPropagation()
      setDestination(link.href)
    }

    document.addEventListener("input", markDirty, true)
    document.addEventListener("change", markDirty, true)
    document.addEventListener("submit", markSaved, true)
    document.addEventListener("click", guardLink, true)
    window.addEventListener("beforeunload", beforeUnload)
    return () => {
      document.removeEventListener("input", markDirty, true)
      document.removeEventListener("change", markDirty, true)
      document.removeEventListener("submit", markSaved, true)
      document.removeEventListener("click", guardLink, true)
      window.removeEventListener("beforeunload", beforeUnload)
    }
  }, [enabled])

  return (
    <Dialog open={destination !== null} onOpenChange={(open) => { if (!open) setDestination(null) }}>
      <StandardDialogContent
        title="Discard unsaved changes?"
        description="Your changes have not been saved. You can keep editing or discard them and leave this form."
      >
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setDestination(null)}>Keep Editing</Button>
          <Button type="button" variant="destructive" onClick={() => {
            if (!destination) return
            dirty.current = false
            window.location.assign(destination)
          }}>Discard Changes and Close</Button>
        </DialogFooter>
      </StandardDialogContent>
    </Dialog>
  )
}
