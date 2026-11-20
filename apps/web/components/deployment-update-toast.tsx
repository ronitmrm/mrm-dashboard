"use client"

import { useEffect } from "react"
import { Toaster, toast } from "@workspace/ui/components/sonner"

import { useTheme } from "@/components/theme-provider"

const checkIntervalMs = 60_000

// Next.js stamps each release's id on <html data-dpl-id>. When the live server reports a
// different one, a release went out after this tab loaded.
export function DeploymentUpdateToast() {
  const { theme } = useTheme()

  useEffect(() => {
    const loaded = document.documentElement.dataset.dplId
    if (!loaded) return // development builds have no deployment id

    let announced = false
    const check = async () => {
      if (announced || document.hidden) return
      try {
        const response = await fetch("/api/deployment", { cache: "no-store" })
        if (!response.ok) return
        const { deploymentId } = (await response.json()) as { deploymentId: string | null }
        if (!deploymentId || deploymentId === loaded) return
        announced = true
        toast.info("A new version of the app is available", {
          action: { label: "Refresh", onClick: () => window.location.reload() },
          closeButton: true,
          description: "Save any unsaved work, then refresh to load it.",
          duration: Infinity,
          id: "deployment-update",
        })
      } catch {
        // Offline or mid-deploy; the next check retries.
      }
    }

    const interval = window.setInterval(check, checkIntervalMs)
    document.addEventListener("visibilitychange", check)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener("visibilitychange", check)
    }
  }, [])

  return <Toaster position="bottom-right" theme={theme} />
}
