import type { SemanticTone } from "@workspace/ui/lib/semantic-tone"

import type { PersonalDashboardWidgetId } from "./personal-dashboard"

export const dashboardMetricCatalog = {
  "commercial.customers": metric(
    "Customers",
    "Canonical customer masters",
    "commercial-overview",
    "neutral"
  ),
  "commercial.enquiries": metric(
    "Enquiries",
    "Commercial enquiries received",
    "commercial-overview",
    "brand"
  ),
  "commercial.quoted-this-month": metric(
    "Quoted this month",
    "Sent in the current month",
    "commercial-overview",
    "information"
  ),
  "commercial.pending-costing": metric(
    "Pending costing",
    "Awaiting costing completion",
    "commercial-overview",
    "warning"
  ),
  "commercial.active-quotes": metric(
    "Q prices",
    "Active quoted prices",
    "commercial-overview",
    "neutral"
  ),
  "commercial.ordered": metric(
    "Ordered",
    "Converted commercial lines",
    "commercial-overview",
    "positive"
  ),
  "commercial.active-production-prices": metric(
    "Active P prices",
    "Active production prices",
    "commercial-overview",
    "accent"
  ),
  "commercial.followups-due": metric(
    "Follow-ups due",
    "Customer actions now due",
    "commercial-overview",
    "danger"
  ),
  "hr.approved-posts": metric(
    "Approved posts",
    "Approved recruitment posts",
    "hr-job-posts",
    "information"
  ),
  "hr.vacant-posts": metric(
    "Vacant posts",
    "Approved posts with open capacity",
    "hr-job-posts",
    "warning"
  ),
  "hr.templates": metric(
    "Templates",
    "Recruitment templates",
    "hr-job-posts",
    "brand"
  ),
  "hr.open-jobs": metric(
    "Open jobs",
    "Active recruitment jobs",
    "hr-job-posts",
    "accent"
  ),
  "hr.candidates": metric(
    "Candidates",
    "Candidates across recruitment",
    "hr-job-posts",
    "information"
  ),
  "hr.interviews": metric(
    "Interviews",
    "Scheduled recruitment interviews",
    "hr-job-posts",
    "brand"
  ),
  "store.locations": metric(
    "Store locations",
    "Active stock locations",
    "store-overview",
    "information"
  ),
  "store.item-types": metric(
    "Item types",
    "Coded inventory types",
    "store-overview",
    "brand"
  ),
  "store.physical-assets": metric(
    "Physical assets",
    "Tracked returnable units",
    "store-overview",
    "accent"
  ),
  "store.open-requests": metric(
    "Open requests",
    "Pending or partially issued requests",
    "store-overview",
    "warning"
  ),
  "store.due-maintenance": metric(
    "Due maintenance",
    "Maintenance or calibration due",
    "store-overview",
    "danger"
  ),
  "store.low-stock": metric(
    "Low stock",
    "Items at or below minimum stock",
    "store-overview",
    "danger"
  ),
} as const

export type DashboardMetricId = keyof typeof dashboardMetricCatalog

export type DashboardMetricWidget = {
  id: string
  kind: "metric"
  metricId: DashboardMetricId
}

export type DashboardChartWidget = {
  id: string
  kind: "chart"
  metricIds: DashboardMetricId[]
  title: string
}
export type DashboardFormulaOperator = "add" | "subtract" | "percent"

export type DashboardFormulaWidget = {
  id: string
  kind: "formula"
  leftMetricId: DashboardMetricId
  operator: DashboardFormulaOperator
  rightMetricId: DashboardMetricId
  title: string
}

export type DashboardAnalyticsWidget =
  | DashboardChartWidget
  | DashboardMetricWidget
  | DashboardFormulaWidget

export type DashboardAnalyticsConfiguration = {
  version: 1
  widgets: DashboardAnalyticsWidget[]
}

export type DashboardMetricValues = Partial<Record<DashboardMetricId, number>>

export function dashboardMetricIdsForWidgets(
  widgets: readonly DashboardAnalyticsWidget[]
) {
  const metricIds: DashboardMetricId[] = []
  const seen = new Set<DashboardMetricId>()

  for (const widget of widgets) {
    const widgetMetricIds =
      widget.kind === "metric"
        ? [widget.metricId]
        : widget.kind === "formula"
          ? [widget.leftMetricId, widget.rightMetricId]
          : widget.metricIds
    for (const metricId of widgetMetricIds) {
      if (seen.has(metricId)) continue
      seen.add(metricId)
      metricIds.push(metricId)
    }
  }
  return metricIds
}

export function availableDashboardMetricIds(
  availableWidgetIds: readonly PersonalDashboardWidgetId[]
) {
  const available = new Set<PersonalDashboardWidgetId>(availableWidgetIds)
  return (Object.keys(dashboardMetricCatalog) as DashboardMetricId[]).filter(
    (metricId) => available.has(dashboardMetricCatalog[metricId].sourceWidgetId)
  )
}

export function resolveDashboardAnalyticsConfiguration(
  input: unknown,
  availableMetricIds: readonly string[]
): DashboardAnalyticsConfiguration {
  const available = new Set(availableMetricIds.filter(isDashboardMetricId))
  const widgets =
    isRecord(input) && Array.isArray(input.widgets) ? input.widgets : []
  const resolved: DashboardAnalyticsWidget[] = []
  const seen = new Set<string>()

  for (const candidate of widgets) {
    const widget = resolveWidget(candidate, available)
    if (!widget || seen.has(widget.id)) continue
    seen.add(widget.id)
    resolved.push(widget)
    if (resolved.length === 24) break
  }

  return { version: 1, widgets: resolved }
}

export function addMetricToDashboard(
  configuration: DashboardAnalyticsConfiguration,
  metricId: string,
  availableMetricIds: readonly string[]
) {
  const resolved = resolveDashboardAnalyticsConfiguration(
    configuration,
    availableMetricIds
  )
  if (!isDashboardMetricId(metricId)) return resolved
  if (!availableMetricIds.includes(metricId)) return resolved
  if (
    resolved.widgets.some(
      (widget) => widget.kind === "metric" && widget.metricId === metricId
    )
  ) {
    return resolved
  }
  if (resolved.widgets.length === 24) return resolved

  return {
    version: 1 as const,
    widgets: [
      ...resolved.widgets,
      { id: `metric:${metricId}`, kind: "metric" as const, metricId },
    ],
  }
}

export function evaluateDashboardFormula(
  widget: DashboardFormulaWidget,
  values: DashboardMetricValues
):
  | { format: "number" | "percent"; ok: true; value: number }
  | { error: string; ok: false } {
  const left = values[widget.leftMetricId]
  const right = values[widget.rightMetricId]
  if (!Number.isFinite(left) || !Number.isFinite(right)) {
    return { error: "Metric data is unavailable", ok: false }
  }
  const leftValue = Number(left)
  const rightValue = Number(right)

  if (widget.operator === "percent") {
    if (rightValue === 0) return { error: "The divisor is zero", ok: false }
    return {
      format: "percent",
      ok: true,
      value: round((leftValue / rightValue) * 100),
    }
  }

  return {
    format: "number",
    ok: true,
    value: round(
      widget.operator === "add"
        ? leftValue + rightValue
        : leftValue - rightValue
    ),
  }
}

function metric(
  title: string,
  description: string,
  sourceWidgetId: PersonalDashboardWidgetId,
  tone: SemanticTone
) {
  return { description, sourceWidgetId, title, tone, unit: "count" as const }
}

function resolveWidget(
  input: unknown,
  available: ReadonlySet<DashboardMetricId>
): DashboardAnalyticsWidget | null {
  if (!isRecord(input)) return null
  const id = cleanIdentifier(input.id)
  if (!id) return null

  if (
    input.kind === "metric" &&
    isDashboardMetricId(input.metricId) &&
    available.has(input.metricId)
  ) {
    return { id, kind: "metric", metricId: input.metricId }
  }

  const title = cleanTitle(input.title)
  if (input.kind === "chart" && title && Array.isArray(input.metricIds)) {
    const metricIds = input.metricIds.filter(
      (metricId): metricId is DashboardMetricId =>
        isDashboardMetricId(metricId) && available.has(metricId)
    )
    const uniqueMetricIds = [...new Set(metricIds)].slice(0, 8)
    if (uniqueMetricIds.length >= 2) {
      return {
        id,
        kind: "chart",
        metricIds: uniqueMetricIds,
        title,
      }
    }
  }

  if (
    input.kind === "formula" &&
    title &&
    isDashboardMetricId(input.leftMetricId) &&
    isDashboardMetricId(input.rightMetricId) &&
    available.has(input.leftMetricId) &&
    available.has(input.rightMetricId) &&
    isFormulaOperator(input.operator)
  ) {
    return {
      id,
      kind: "formula",
      leftMetricId: input.leftMetricId,
      operator: input.operator,
      rightMetricId: input.rightMetricId,
      title,
    }
  }

  return null
}

function isDashboardMetricId(value: unknown): value is DashboardMetricId {
  return (
    typeof value === "string" && Object.hasOwn(dashboardMetricCatalog, value)
  )
}

function isFormulaOperator(value: unknown): value is DashboardFormulaOperator {
  return value === "add" || value === "subtract" || value === "percent"
}

function cleanIdentifier(value: unknown) {
  if (typeof value !== "string") return null
  const cleaned = value.trim()
  return cleaned.length > 0 &&
    cleaned.length <= 120 &&
    /^[a-zA-Z0-9_.:-]+$/.test(cleaned)
    ? cleaned
    : null
}

function cleanTitle(value: unknown) {
  if (typeof value !== "string") return null
  const cleaned = value.trim().replace(/\s+/g, " ")
  return cleaned.length > 0 && cleaned.length <= 80 ? cleaned : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function round(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}
