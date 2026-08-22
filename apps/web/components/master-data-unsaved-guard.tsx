"use client"

import { useEffect } from "react"

const warning = "You have unsaved changes. Leave this master form?"

export function MasterDataUnsavedGuard({
  enabled = true,
}: {
  enabled?: boolean
}) {
  useEffect(() => {
    if (!enabled) return
    let dirty = false

    const markDirty = (event: Event) => {
      const target = event.target
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLSelectElement ||
        target instanceof HTMLTextAreaElement
      ) {
        if (target.form) dirty = true
      }
    }
    const markSaved = () => {
      dirty = false
    }
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return
      event.preventDefault()
    }
    const guardLink = (event: MouseEvent) => {
      if (!dirty || !(event.target instanceof Element)) return
      const link = event.target.closest("a[href]")
      if (!link || window.confirm(warning)) return
      event.preventDefault()
      event.stopPropagation()
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

  return null
}
