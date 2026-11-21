"use client"

import { useEffect, useState } from "react"

import { formatIstDateTime } from "@/lib/date-time"

// Deterrents only: a web page cannot stop OS screenshots or a phone camera.
// The watermark makes any capture traceable; the rest stop casual attempts.

function watermarkImage(text: string) {
  const escaped = text.replace(/[<>&'"]/g, (character) => `&#${character.charCodeAt(0)};`)
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='360' height='200'><text x='50%' y='50%' fill='#808080' fill-opacity='0.16' font-family='sans-serif' font-size='14' text-anchor='middle' transform='rotate(-24 180 100)'>${escaped}</text></svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
}

// Starts after mount so the server and browser render the same markup.
function useNow(enabled: boolean) {
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    if (!enabled) return
    const tick = () => setNow(new Date())
    const first = window.setTimeout(tick, 0)
    const timer = window.setInterval(tick, 30_000)
    return () => {
      window.clearTimeout(first)
      window.clearInterval(timer)
    }
  }, [enabled])
  return now
}

function useWindowFocused(enabled: boolean) {
  const [focused, setFocused] = useState(true)
  useEffect(() => {
    if (!enabled) return
    const update = () =>
      setFocused(document.hasFocus() && document.visibilityState === "visible")
    update()
    window.addEventListener("blur", update)
    window.addEventListener("focus", update)
    document.addEventListener("visibilitychange", update)
    return () => {
      window.removeEventListener("blur", update)
      window.removeEventListener("focus", update)
      document.removeEventListener("visibilitychange", update)
    }
  }, [enabled])
  return focused
}

function usePrintBlock(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "p") {
        event.preventDefault()
      }
    }
    // Browsers only report Print Screen on release, after Windows copied the
    // screen; overwrite that copy.
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === "PrintScreen") {
        navigator.clipboard?.writeText("").catch(() => undefined)
      }
    }
    window.addEventListener("keydown", onKeyDown, true)
    window.addEventListener("keyup", onKeyUp, true)
    return () => {
      window.removeEventListener("keydown", onKeyDown, true)
      window.removeEventListener("keyup", onKeyUp, true)
    }
  }, [enabled])
}

export function ScreenProtectionClient({
  blockPrint,
  hideUnfocused,
  identity,
  watermark,
}: {
  blockPrint: boolean
  hideUnfocused: boolean
  identity: string
  watermark: boolean
}) {
  const now = useNow(watermark)
  const focused = useWindowFocused(hideUnfocused)
  usePrintBlock(blockPrint)

  return (
    <>
      {blockPrint ? (
        <style>{`@media print { body > * { display: none !important; } }`}</style>
      ) : null}
      {watermark && now ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-[2147483646] print:hidden"
          style={{
            backgroundImage: watermarkImage(`${identity} · ${formatIstDateTime(now)}`),
          }}
        />
      ) : null}
      {hideUnfocused && !focused ? (
        <div
          className="fixed inset-0 z-[2147483647] grid place-items-center bg-background p-6 text-center text-sm text-muted-foreground"
          role="status"
        >
          Content is hidden while this window is not in focus. Click here to
          continue.
        </div>
      ) : null}
    </>
  )
}
