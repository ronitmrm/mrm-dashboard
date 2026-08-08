type JsonRecord = Record<string, unknown>

export type PlanningRefreshLock = {
  baselineRequestedAtMs: number | null
  baselineCompletedAtMs: number | null
}

type DashboardRefreshStatus = {
  status?: unknown
  isRefreshing?: unknown
  requestedAtMs?: unknown
  completedAtMs?: unknown
}

function record(value: unknown): JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : {}
}

export function dashboardStateRequestUrl(
  url: string,
  currentState?: JsonRecord
) {
  if (!url.startsWith("/api/dashboard-state")) return url
  const requestUrl = new URL(url, "http://dashboard.local")
  const currentDashboard = record(record(currentState).dashboard)
  if (
    requestUrl.searchParams.get("floor") !==
    currentDashboard.productionFloorCode
  ) {
    return url
  }

  const knownVersion = Number(currentDashboard.readModelVersion)
  if (!Number.isSafeInteger(knownVersion) || knownVersion <= 0) return url

  requestUrl.searchParams.set("knownVersion", String(knownVersion))
  return `${requestUrl.pathname}${requestUrl.search}`
}

function numberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

export function refreshLockFromStatus(
  status: DashboardRefreshStatus | undefined
): PlanningRefreshLock {
  return {
    baselineRequestedAtMs: numberOrNull(status?.requestedAtMs),
    baselineCompletedAtMs: numberOrNull(status?.completedAtMs),
  }
}

export function refreshLockHasSettled(
  lock: PlanningRefreshLock,
  status: DashboardRefreshStatus | undefined
) {
  if (!status || status.isRefreshing) return false
  const currentStatus = String(status.status ?? "").trim()
  if (
    currentStatus !== "complete" &&
    currentStatus !== "idle" &&
    currentStatus !== "failed"
  ) {
    return false
  }
  const requestedAtMs = numberOrNull(status.requestedAtMs)
  const completedAtMs = numberOrNull(status.completedAtMs)
  const sawNewRequest = requestedAtMs !== lock.baselineRequestedAtMs
  const sawNewCompletion = completedAtMs !== lock.baselineCompletedAtMs
  return sawNewRequest && (sawNewCompletion || currentStatus === "failed")
}
