"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { readRecordHistory } from "@/lib/record-history"

type RecordBody = Record<string, unknown>

// Shared by the session register and quality restart queue. Only changed
// canonical rows reach consumers; drafts and selection remain consumer-owned.
export function useConditionalRecords(
  url: string | null,
  onChanged?: (body: RecordBody) => void,
  onDenied?: () => void,
  loadAllRows = false
) {
  const [result, setResult] = useState<{
    url: string | null
    data: RecordBody | null
    error: string | null
    accessDenied: boolean
    loading: boolean
  }>({
    url,
    data: null,
    error: null,
    accessDenied: false,
    loading: Boolean(url),
  })
  const callback = useRef(onChanged)
  const denialCallback = useRef(onDenied)
  const reconcile = useRef<() => void>(() => undefined)
  useEffect(() => {
    callback.current = onChanged
  }, [onChanged])
  useEffect(() => {
    denialCallback.current = onDenied
  }, [onDenied])
  useEffect(() => {
    if (!url) return
    const controller = new AbortController()
    let data: RecordBody | null = null
    let revision: string | null = null
    let inFlight = false
    let pending = false
    let failures = 0
    let denied = false
    let timeout: number | undefined
    const clearTimer = () => {
      if (timeout !== undefined) window.clearTimeout(timeout)
      timeout = undefined
    }
    const load = async () => {
      clearTimer()
      if (document.hidden || controller.signal.aborted) return
      if (inFlight) {
        pending = true
        return
      }
      inFlight = true
      try {
        const requestUrl = new URL(url, window.location.origin)
        if (revision)
          requestUrl.searchParams.set("knownSourceRevision", revision)
        let response = await fetch(requestUrl, {
          cache: "no-store",
          credentials: "same-origin",
          signal: controller.signal,
        })
        let body = (await response.json().catch(() => ({}))) as RecordBody
        if (loadAllRows && response.ok && body.notModified !== true) {
          const history = await readRecordHistory(
            requestUrl, response, body, controller.signal
          )
          response = history.response
          body = history.body
        }
        if (controller.signal.aborted) return
        if (!response.ok) {
          const accessDenied =
            response.status === 401 || response.status === 403
          if (accessDenied) {
            data = null
            revision = null
            denied = true
            denialCallback.current?.()
          }
          failures++
          setResult({
            url,
            data,
            accessDenied: denied,
            loading: false,
            error: String(
              body.error ?? "Production sessions could not be loaded."
            ),
          })
        } else {
          failures = 0
          denied = false
          if (typeof body.sourceRevision === "string")
            revision = body.sourceRevision
          if (body.notModified !== true) {
            data = body
            callback.current?.(body)
          }
          setResult({
            url,
            data,
            accessDenied: false,
            error: null,
            loading: false,
          })
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          failures++
          setResult({
            url,
            data,
            accessDenied: denied,
            loading: false,
            error:
              error instanceof Error
                ? error.message
                : "Production sessions could not be loaded.",
          })
        }
      } finally {
        inFlight = false
        if (!controller.signal.aborted && !document.hidden) {
          const delay = pending
            ? 0
            : Math.min(30_000, 2_500 * 2 ** Math.min(failures, 4))
          pending = false
          timeout = window.setTimeout(() => void load(), delay)
        }
      }
    }
    const refresh = () => void load()
    reconcile.current = refresh
    const visibility = () => {
      if (document.hidden) clearTimer()
      else refresh()
    }
    document.addEventListener("visibilitychange", visibility)
    window.addEventListener("focus", refresh)
    window.addEventListener("online", refresh)
    void load()
    return () => {
      controller.abort()
      clearTimer()
      document.removeEventListener("visibilitychange", visibility)
      window.removeEventListener("focus", refresh)
      window.removeEventListener("online", refresh)
      reconcile.current = () => undefined
    }
  }, [url, loadAllRows])
  const refresh = useCallback(() => reconcile.current(), [])
  return {
    ...(result.url === url
      ? result
      : {
          url,
          data: null,
          error: null,
          accessDenied: false,
          loading: Boolean(url),
        }),
    refresh,
  }
}
