"use client"

import { useCallback, useEffect, useReducer, useRef } from "react"
import { useMasterStateUrl } from "@/components/master-access-provider"
import { useOperationalEntryStateUrl } from "@/components/operational-entry-access-provider"

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
  type DashboardVisibilityState,
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

function currentVisibility(): DashboardVisibilityState {
  return typeof document !== "undefined" &&
    document.visibilityState === "hidden"
    ? "hidden"
    : "visible"
}

export function useDashboardDelivery({
  floor,
  onData,
}: UseDashboardDeliveryOptions) {
  const masterStateUrl = useMasterStateUrl()
  const operationalEntryStateUrl = useOperationalEntryStateUrl()
  const scopedStateUrl = operationalEntryStateUrl ?? masterStateUrl
  const deliveryEnabled =
    !scopedStateUrl ||
    new URLSearchParams(scopedStateUrl.split("?")[1]).get("entry") !==
      "store_masters"
  const scopeKey = `${floor}:${scopedStateUrl ?? "dashboard"}`
  const [state, reactDispatch] = useReducer(
    (
      current: DashboardDeliveryState<DashboardRecord>,
      action: DashboardDeliveryAction<DashboardRecord>
    ) => dashboardDeliveryReducer(current, action),
    createDashboardDeliveryState<DashboardRecord>(
      floor,
      currentVisibility(),
      scopeKey
    )
  )
  const stateRef = useRef(state)
  const onDataRef = useRef(onData)
  const requestIdRef = useRef(0)
  const requestControllerRef = useRef<AbortController | null>(null)
  const requestCanonicalStateRef = useRef<() => void>(() => undefined)
  const scopeRef = useRef(scopeKey)

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
    if (!deliveryEnabled) return
    if (stateRef.current.scopeKey !== scopeKey) return
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
      scopeKey: request.scopeKey,
      requestId: request.requestId,
    }).next
    if (started.inFlight?.requestId !== request.requestId) {
      requestControllerRef.current = null
      return
    }

    try {
      const liveVersion = stateRef.current.data?.liveVersion
      const sourceRevision = stateRef.current.data?.sourceRevision
      const response = await fetch(
        dashboardCanonicalRequestUrl(
          {
            ...request,
            knownLiveVersion:
              typeof liveVersion === "string" ? liveVersion : null,
            knownSourceRevision:
              typeof sourceRevision === "string" ? sourceRevision : null,
          },
          scopedStateUrl
        ),
        {
          cache: "no-store",
          credentials: "same-origin",
          signal: controller.signal,
        }
      )
      const body = (await response.json().catch(() => ({}))) as DashboardRecord
      if (!response.ok) {
        const message =
          typeof body.error === "string" && body.error.trim()
            ? body.error.trim()
            : "Dashboard data could not be loaded."
        dispatch({
          type: "request.failed",
          ...request,
          atMs: Date.now(),
          message,
          accessDenied: response.status === 401 || response.status === 403,
        })
        return
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
          scopeKey: request.scopeKey,
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
          scopeKey: request.scopeKey,
          message: error.message,
          requestId: request.requestId,
        })
      } else {
        dispatch({
          type: "request.failed",
          atMs: Date.now(),
          floor: request.floor,
          scopeKey: request.scopeKey,
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
  }, [deliveryEnabled, dispatch, scopeKey, scopedStateUrl])

  useEffect(() => {
    requestCanonicalStateRef.current = () => void requestCanonicalState()
  }, [requestCanonicalState])

  useEffect(() => {
    onDataRef.current = onData
  }, [onData])

  useEffect(() => {
    if (scopeRef.current === scopeKey) return
    requestControllerRef.current?.abort()
    requestControllerRef.current = null
    scopeRef.current = scopeKey
    dispatch({ type: "floor.changed", floor, scopeKey })
  }, [dispatch, floor, scopeKey])

  useEffect(() => {
    const handleVisibilityChange = () => {
      dispatch({
        type: "visibility.changed",
        atMs: Date.now(),
        visibility:
          document.visibilityState === "hidden" ? "hidden" : "visible",
      })
    }
    document.addEventListener("visibilitychange", handleVisibilityChange)
    const reconcile = () => {
      if (!document.hidden) dispatch({ type: "retry.requested" })
    }
    window.addEventListener("focus", reconcile)
    window.addEventListener("online", reconcile)
    handleVisibilityChange()
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      window.removeEventListener("focus", reconcile)
      window.removeEventListener("online", reconcile)
    }
  }, [dispatch])

  useEffect(() => {
    const nowMs = Date.now()
    if (!deliveryEnabled) return
    const delay = dashboardDeliveryPollDelay(state, nowMs)
    if (delay === null) return
    if (delay === 0) {
      if (state.request === "initial" || state.request === "canonical-state") {
        void requestCanonicalState()
      } else {
        dispatch({ type: "safety.due", atMs: nowMs })
      }
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
  }, [deliveryEnabled, dispatch, requestCanonicalState, state])

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

  return {
    deliveryEnabled,
    refreshFailed,
    refreshRequested,
    retry,
    state:
      state.scopeKey === scopeKey
        ? state
        : createDashboardDeliveryState<DashboardRecord>(
            floor,
            state.visibility,
            scopeKey
          ),
  }
}
