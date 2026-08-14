import {
  dashboardCoverageFromState,
  mergeDashboardStateResponse,
  type DashboardRecord,
} from "./dashboard-view-model"
import type {
  DashboardCoverageState,
  DashboardDeliveryAction,
  DashboardDeliveryState,
  DashboardDurableRefreshState,
  DashboardRequestDescriptor,
} from "./dashboard-delivery-state"

type DashboardResponseInput = {
  atMs: number
  currentData: DashboardRecord | null
  request: DashboardRequestDescriptor
  response: DashboardRecord
}

function record(value: unknown): DashboardRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as DashboardRecord)
    : {}
}

function positiveVersion(value: unknown) {
  const version = Number(value)
  return Number.isSafeInteger(version) && version > 0 ? version : null
}

function refreshState(status: DashboardRecord): DashboardDurableRefreshState {
  switch (status.status) {
    case "queued":
      return "pending"
    case "running":
      return "running"
    case "failed":
      return "failed"
    default:
      return status.isRefreshing === true ? "pending" : "idle"
  }
}

function coverageState(data: DashboardRecord): DashboardCoverageState {
  const coverage = dashboardCoverageFromState(data)
  return coverage && Object.values(coverage).some((section) => section.truncated)
    ? "partial"
    : "complete"
}

export function dashboardCanonicalRequestUrl(
  request: DashboardRequestDescriptor
) {
  const query = new URLSearchParams({ floor: request.floor })
  if (request.knownVersion !== null) {
    query.set("knownVersion", String(request.knownVersion))
  }
  return `/api/dashboard-state?${query.toString()}`
}

export function dashboardDeliveryResponseAction({
  atMs,
  currentData,
  request,
  response,
}: DashboardResponseInput): Extract<
  DashboardDeliveryAction<DashboardRecord>,
  { type: "state.changed" | "state.not-modified" }
> {
  const data = record(
    mergeDashboardStateResponse(
      currentData ?? undefined,
      response,
      request.floor
    )
  )
  const dashboard = record(data.dashboard)
  const version =
    positiveVersion(data.version) ?? positiveVersion(dashboard.readModelVersion)
  if (version === null) {
    throw new Error("Dashboard canonical state did not include a valid version.")
  }
  const status = record(data.status)
  const refresh = refreshState(status)
  const refreshError =
    typeof status.lastError === "string" && status.lastError.trim()
      ? status.lastError.trim()
      : null
  const delivery = {
    atMs,
    data,
    floor: request.floor,
    refresh,
    refreshError,
    requestId: request.requestId,
    version,
  }

  return response.notModified === true
    ? { ...delivery, type: "state.not-modified" }
    : {
        ...delivery,
        type: "state.changed",
        coverage: coverageState(data),
      }
}

function sectionLabel(key: string) {
  return key.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase()
}

function groupLabel(key: string) {
  return key.replaceAll("_", " ")
}

export function dashboardCoverageNotice(
  data: DashboardRecord | null,
  floorLabel: string
) {
  const coverage = dashboardCoverageFromState(data)
  if (!coverage) return null
  const sections = Object.entries(coverage).flatMap(([key, section]) => {
    if (!section.truncated) return []
    const groups = section.truncatedGroups.map(groupLabel)
    return `${sectionLabel(key)} returned ${section.returned.toLocaleString("en-IN")} of ${section.available.toLocaleString("en-IN")} records${groups.length ? ` (${groups.join(", ")})` : ""}`
  })
  return sections.length
    ? `${floorLabel} data is partial: ${sections.join("; ")}.`
    : null
}

export function dashboardConnectionLabel<Data>(
  state: DashboardDeliveryState<Data>
) {
  if (state.data === null) {
    return state.request === "error" ? "Unavailable" : "Loading"
  }
  if (state.connection === "retrying") return "Reconnecting"
  if (state.payload === "stale") return "Stale"
  if (state.inFlight !== null || state.request === "canonical-state") {
    return "Checking updates"
  }
  if (state.connection === "connecting") return "Connecting"
  return "Connected"
}

function sentence(message: string) {
  const trimmed = message.trim()
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`
}

export function dashboardDeliveryNotice<Data>(
  state: DashboardDeliveryState<Data>
) {
  if (state.data === null) return null
  if (state.refresh === "failed") {
    return `${sentence(state.lastError ?? "Planning recalculation failed.")} Showing the last successful dashboard.`
  }
  if (state.lastError) {
    return `${sentence(state.lastError)} Showing the last successful dashboard.`
  }
  if (state.connection === "retrying") {
    return "Reconnecting to live updates. Showing the last successful dashboard."
  }
  if (state.refresh === "pending") {
    return "Planning recalculation queued. Showing the current dashboard while it completes."
  }
  if (state.refresh === "running") {
    return "Planning recalculation in progress. Showing the current dashboard while it completes."
  }
  if (state.inFlight !== null || state.request === "canonical-state") {
    return "Checking for dashboard updates."
  }
  return null
}
