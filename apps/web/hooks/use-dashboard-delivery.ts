"use client"

import { useCallback, useEffect, useReducer, useRef } from "react"

import {
  dashboardCanonicalRequestUrl,
  dashboardDeliveryResponseAction,
} from "@/lib/dashboard-delivery-client"
import {
  createDashboardDeliveryState,
  dashboardDeliveryPollDelay,
  dashboardDeliveryReducer,
  dashboardRequestDescriptor,
  type DashboardDeliveryAction,
  type DashboardDeliveryState,
} from "@/lib/dashboard-delivery-state"
import {
  DashboardStateNormalizationError,
  type DashboardRecord,
  type ProductionFloorCode,
} from "@/lib/dashboard-view-model"

type UseDashboardDeliveryOptions = {
  floor: ProductionFloorCode
  onData?: (data: DashboardRecord) => void
}

export function useDashboardDelivery({
  floor,
  onData,
}: UseDashboardDeliveryOptions) {
  const [state, reactDispatch] = useReducer(
    (
      current: DashboardDeliveryState<DashboardRecord>,
      action: DashboardDeliveryAction<DashboardRecord>
    ) => dashboardDeliveryReducer(current, action),
    createDashboardDeliveryState<DashboardRecord>(floor)
  )
  const stateRef = useRef(state)
  const onDataRef = useRef(onData)
  const requestIdRef = useRef(0)
  const requestControllerRef = useRef<AbortController | null>(null)
  const requestCanonicalStateRef = useRef<() => void>(() => undefined)
  const floorRef = useRef(floor)

  const dispatch = useCallback(
    (action: DashboardDeliveryAction<DashboardRecord>) => {
      const previous = stateRef.current
      const next = dashboardDeliveryReducer(previous, action)
      stateRef.current = next
      reactDispatch(action)
      return { next, previous }
    },
    []
  )

  const requestCanonicalState = useCallback(async () => {
    if (requestControllerRef.current) return
    const request = dashboardRequestDescriptor(
      stateRef.current,
      ++requestIdRef.current
    )
    if (!request) return

    const controller = new AbortController()
    requestControllerRef.current = controller
    const started = dispatch({
      type: "request.started",
      floor: request.floor,
      requestId: request.requestId,
    }).next
    if (started.inFlight?.requestId !== request.requestId) {
      requestControllerRef.current = null
      return
    }

    try {
      const response = await fetch(dashboardCanonicalRequestUrl(request), {
        cache: "no-store",
        credentials: "same-origin",
        signal: controller.signal,
      })
      const body = (await response.json().catch(() => ({}))) as DashboardRecord
      if (!response.ok) {
        const message =
          typeof body.error === "string" && body.error.trim()
            ? body.error.trim()
            : "Dashboard data could not be loaded."
        throw new Error(message)
      }
      const action = dashboardDeliveryResponseAction({
        atMs: Date.now(),
        currentData: stateRef.current.data,
        request,
        response: body,
      })
      const { next, previous } = dispatch(action)
      if (next !== previous && next.data === action.data) {
        onDataRef.current?.(action.data)
      }
    } catch (error: unknown) {
      if (controller.signal.aborted) {
        dispatch({
          type: "request.aborted",
          floor: request.floor,
          requestId: request.requestId,
        })
        return
      }
      if (
        error instanceof DashboardStateNormalizationError &&
        request.knownVersion !== null
      ) {
        dispatch({
          type: "state.invalid",
          floor: request.floor,
          message: error.message,
          requestId: request.requestId,
        })
      } else {
        dispatch({
          type: "request.failed",
          atMs: Date.now(),
          floor: request.floor,
          message:
            error instanceof Error
              ? error.message
              : "Dashboard data could not be loaded.",
          requestId: request.requestId,
        })
      }
    } finally {
      if (requestControllerRef.current === controller) {
        requestControllerRef.current = null
      }
      if (!controller.signal.aborted) {
        queueMicrotask(() => requestCanonicalStateRef.current())
      }
    }
  }, [dispatch])

  useEffect(() => {
    requestCanonicalStateRef.current = () => void requestCanonicalState()
  }, [requestCanonicalState])

  useEffect(() => {
    onDataRef.current = onData
  }, [onData])

  useEffect(() => {
    if (floorRef.current === floor) return
    requestControllerRef.current?.abort()
    requestControllerRef.current = null
    floorRef.current = floor
    dispatch({ type: "floor.changed", floor })
  }, [dispatch, floor])

  useEffect(() => {
    const handleVisibilityChange = () => {
      dispatch({
        type: "visibility.changed",
        atMs: Date.now(),
        visibility: document.visibilityState === "hidden" ? "hidden" : "visible",
      })
    }
    document.addEventListener("visibilitychange", handleVisibilityChange)
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange)
  }, [dispatch])

  useEffect(() => {
    const events = new EventSource("/api/dashboard-events")
    const handleOpen = () => dispatch({ type: "connection.opened" })
    const handleError = () => dispatch({ type: "connection.lost" })
    const handleHint = () => dispatch({ type: "hint.received" })
    events.addEventListener("open", handleOpen)
    events.addEventListener("error", handleError)
    events.addEventListener("dashboard-version", handleHint)
    return () => {
      events.removeEventListener("open", handleOpen)
      events.removeEventListener("error", handleError)
      events.removeEventListener("dashboard-version", handleHint)
      events.close()
    }
  }, [dispatch])

  useEffect(() => {
    const nowMs = Date.now()
    const delay = dashboardDeliveryPollDelay(state, nowMs)
    if (delay === null) return
    if (delay === 0) {
      void requestCanonicalState()
      return
    }
    const timeout = window.setTimeout(() => {
      const current = stateRef.current
      dispatch(
        current.refresh === "pending" || current.refresh === "running"
          ? { type: "refresh.poll-due" }
          : { type: "safety.due", atMs: Date.now() }
      )
    }, delay)
    return () => window.clearTimeout(timeout)
  }, [dispatch, requestCanonicalState, state])

  useEffect(
    () => () => {
      requestControllerRef.current?.abort()
    },
    []
  )

  const retry = useCallback(() => {
    dispatch({ type: "retry.requested" })
  }, [dispatch])
  const refreshRequested = useCallback(() => {
    dispatch({ type: "refresh.requested" })
  }, [dispatch])
  const refreshFailed = useCallback(
    (message: string) => {
      dispatch({ type: "refresh.failed", message })
    },
    [dispatch]
  )

  return { refreshFailed, refreshRequested, retry, state }
}
