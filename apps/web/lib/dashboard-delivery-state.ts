import type { ProductionFloorCode } from "@workspace/db"

const DASHBOARD_SAFETY_REFRESH_MS = 2_500

type DashboardPayloadState = "none" | "current" | "stale"
type DashboardCanonicalRequestState =
  | "initial"
  | "canonical-state"
  | "settled"
  | "error"
export type DashboardDurableRefreshState =
  | "idle"
  | "pending"
  | "running"
  | "failed"
export type DashboardCoverageState = "complete" | "partial"
export type DashboardVisibilityState = "visible" | "hidden"

type DashboardRequest = {
  floor: ProductionFloorCode
  scopeKey?: string
  requestId: number
}

export type DashboardRequestDescriptor = DashboardRequest & {
  knownSourceRevision?: string | null
  knownLiveVersion?: string | null
  knownVersion: number | null
}

export type DashboardDeliveryState<Data> = {
  accessDenied: boolean
  failureCount: number
  scopeKey: string
  coverage: DashboardCoverageState
  data: Data | null
  floor: ProductionFloorCode
  inFlight: DashboardRequest | null
  lastError: string | null
  lastSuccessfulAtMs: number | null
  payload: DashboardPayloadState
  refresh: DashboardDurableRefreshState
  refetchPending: boolean
  request: DashboardCanonicalRequestState
  safetyDeadlineMs: number | null
  suppressKnownVersion: boolean
  version: number | null
  visibility: DashboardVisibilityState
}

export type DashboardDeliveryAction<Data> =
  | { type: "floor.changed"; floor: ProductionFloorCode; scopeKey?: string }
  | { type: "refresh.failed"; message: string }
  | { type: "refresh.poll-due" }
  | { type: "refresh.requested" }
  | { type: "refresh.running" }
  | { type: "retry.requested" }
  | { type: "safety.due"; atMs: number }
  | {
      type: "visibility.changed"
      atMs: number
      visibility: DashboardVisibilityState
    }
  | ({
      type: "request.failed"
      atMs: number
      message: string
      accessDenied?: boolean
    } & DashboardRequest)
  | ({ type: "request.aborted" } & DashboardRequest)
  | ({ type: "request.started" } & DashboardRequest)
  | ({ type: "state.invalid"; message: string } & DashboardRequest)
  | ({
      type: "state.changed"
      atMs: number
      coverage: DashboardCoverageState
      data: Data
      refresh: DashboardDurableRefreshState
      refreshError?: string | null
      version: number
    } & DashboardRequest)
  | ({
      type: "state.not-modified"
      atMs: number
      data: Data
      refresh: DashboardDurableRefreshState
      refreshError?: string | null
      version: number
    } & DashboardRequest)

export function createDashboardDeliveryState<Data>(
  floor: ProductionFloorCode,
  visibility: DashboardVisibilityState = "visible",
  scopeKey: string = floor
): DashboardDeliveryState<Data> {
  return {
    accessDenied: false,
    failureCount: 0,
    scopeKey,
    coverage: "complete",
    data: null,
    floor,
    inFlight: null,
    lastError: null,
    lastSuccessfulAtMs: null,
    payload: "none",
    refresh: "idle",
    refetchPending: false,
    request: "initial",
    safetyDeadlineMs: null,
    suppressKnownVersion: false,
    version: null,
    visibility,
  }
}

function ownsRequest<Data>(
  state: DashboardDeliveryState<Data>,
  request: DashboardRequest
) {
  return (
    state.inFlight?.requestId === request.requestId &&
    state.inFlight.floor === request.floor &&
    state.floor === request.floor &&
    (request.scopeKey === undefined || state.scopeKey === request.scopeKey)
  )
}

export function dashboardDeliveryReducer<Data>(
  state: DashboardDeliveryState<Data>,
  action: DashboardDeliveryAction<Data>
): DashboardDeliveryState<Data> {
  switch (action.type) {
    case "floor.changed":
      return createDashboardDeliveryState<Data>(
        action.floor,
        state.visibility,
        action.scopeKey ?? action.floor
      )
    case "refresh.requested":
      return {
        ...state,
        refresh: "pending",
        refetchPending: true,
        request: "canonical-state",
      }
    case "refresh.running":
      return { ...state, refresh: "running" }
    case "refresh.failed":
      return {
        ...state,
        lastError: action.message,
        payload: state.data === null ? "none" : "stale",
        refresh: "failed",
        request: state.data === null ? "error" : "settled",
      }
    case "refresh.poll-due":
      if (
        state.visibility === "hidden" ||
        (state.refresh !== "pending" && state.refresh !== "running")
      ) {
        return state
      }
      return {
        ...state,
        refetchPending: true,
        request: "canonical-state",
      }
    case "retry.requested":
      return {
        ...state,
        lastError: null,
        refetchPending: true,
        request: state.data === null ? "initial" : "canonical-state",
      }
    case "safety.due":
      if (
        state.visibility === "hidden" ||
        state.safetyDeadlineMs === null ||
        action.atMs < state.safetyDeadlineMs
      ) {
        return state
      }
      return {
        ...state,
        refetchPending: true,
        request: "canonical-state",
      }
    case "visibility.changed": {
      if (action.visibility === "hidden") {
        return { ...state, visibility: "hidden" }
      }
      const nextRequest: DashboardCanonicalRequestState =
        state.data === null ? "initial" : "canonical-state"
      return {
        ...state,
        refetchPending: true,
        request: nextRequest,
        visibility: "visible",
      }
    }
    case "request.started":
      if (
        state.floor !== action.floor ||
        (action.scopeKey !== undefined && state.scopeKey !== action.scopeKey) ||
        state.inFlight !== null ||
        (state.request !== "initial" && state.request !== "canonical-state") ||
        state.visibility === "hidden"
      ) {
        return state
      }
      return {
        ...state,
        inFlight: {
          floor: action.floor,
          requestId: action.requestId,
          scopeKey: action.scopeKey,
        },
        refetchPending: false,
      }
    case "request.failed": {
      if (!ownsRequest(state, action)) return state
      const data = action.accessDenied ? null : state.data
      return {
        ...state,
        inFlight: null,
        lastError: action.message,
        accessDenied: state.accessDenied || action.accessDenied === true,
        data,
        failureCount: state.failureCount + 1,
        payload: data === null ? "none" : "stale",
        request: data === null ? "error" : "settled",
        safetyDeadlineMs:
          action.atMs +
          Math.min(
            30_000,
            DASHBOARD_SAFETY_REFRESH_MS *
              2 ** Math.min(state.failureCount + 1, 4)
          ),
      }
    }
    case "request.aborted":
      if (!ownsRequest(state, action)) return state
      return {
        ...state,
        inFlight: null,
        refetchPending: true,
      }
    case "state.invalid":
      if (!ownsRequest(state, action)) return state
      return {
        ...state,
        inFlight: null,
        lastError: action.message,
        payload: state.data === null ? "none" : "stale",
        refetchPending: true,
        request: "canonical-state",
        suppressKnownVersion: true,
      }
    case "state.changed":
      if (!ownsRequest(state, action)) return state
      if (state.version !== null && action.version < state.version) {
        return {
          ...state,
          inFlight: null,
          lastError:
            "A regressive dashboard version was rejected; canonical refetch required.",
          payload: state.data === null ? "none" : "stale",
          refetchPending: true,
          request: "canonical-state",
          suppressKnownVersion: true,
        }
      }
      return {
        ...state,
        coverage: action.coverage,
        accessDenied: false,
        failureCount: 0,
        data: action.data,
        inFlight: null,
        lastError:
          action.refresh === "failed"
            ? (action.refreshError ?? "Planning recalculation failed.")
            : null,
        lastSuccessfulAtMs: action.atMs,
        payload: action.refresh === "failed" ? "stale" : "current",
        refresh: action.refresh,
        request: state.refetchPending ? "canonical-state" : "settled",
        safetyDeadlineMs: action.atMs + DASHBOARD_SAFETY_REFRESH_MS,
        suppressKnownVersion: false,
        version: action.version,
      }
    case "state.not-modified":
      if (!ownsRequest(state, action)) return state
      if (
        state.data === null ||
        state.version === null ||
        state.version !== action.version
      ) {
        return {
          ...state,
          inFlight: null,
          lastError:
            "An unchanged response requires retained same-floor dashboard data.",
          payload: state.data === null ? "none" : "stale",
          refetchPending: true,
          request: "canonical-state",
          suppressKnownVersion: true,
        }
      }
      return {
        ...state,
        accessDenied: false,
        failureCount: 0,
        data: action.data,
        inFlight: null,
        lastError:
          action.refresh === "failed"
            ? (action.refreshError ?? "Planning recalculation failed.")
            : null,
        lastSuccessfulAtMs: action.atMs,
        payload: action.refresh === "failed" ? "stale" : "current",
        refresh: action.refresh,
        request: state.refetchPending ? "canonical-state" : "settled",
        safetyDeadlineMs: action.atMs + DASHBOARD_SAFETY_REFRESH_MS,
        suppressKnownVersion: false,
      }
  }
}

export function dashboardDeliveryPollDelay<Data>(
  state: DashboardDeliveryState<Data>,
  nowMs: number
) {
  if (state.visibility === "hidden" || state.inFlight !== null) return null
  if (state.request === "initial" || state.request === "canonical-state") {
    return 0
  }
  if (state.safetyDeadlineMs === null) return null
  return Math.max(0, state.safetyDeadlineMs - nowMs)
}

export function dashboardRequestDescriptor<Data>(
  state: DashboardDeliveryState<Data>,
  requestId: number
): DashboardRequestDescriptor | null {
  if (
    state.visibility === "hidden" ||
    state.inFlight !== null ||
    (state.request !== "initial" && state.request !== "canonical-state")
  ) {
    return null
  }
  return {
    floor: state.floor,
    scopeKey: state.scopeKey,
    knownVersion:
      state.request === "initial" ||
      state.data === null ||
      state.suppressKnownVersion ||
      state.version === null
        ? null
        : state.version,
    requestId,
  }
}
