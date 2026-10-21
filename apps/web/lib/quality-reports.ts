import { productionFloors } from "@workspace/db/production-floors"
import type { UnifiedNavigationAccess } from "./auth/unified-navigation-access"

export const qualityReportGroups = {
  daily: "Daily Quality",
  inspectors: "Inspector Approvals",
  machines: "Machine Rejection",
  defects: "Defect Rejection",
  shifts: "Shift Quality",
} as const
export type QualityReportGroup = keyof typeof qualityReportGroups
export const qualityCharts = {
  "quality-production": { group: "daily", title: "Production Quality" },
  "quality-first-piece": {
    group: "daily",
    title: "First-Piece Approval Status",
  },
  "quality-approval-trend": {
    group: "daily",
    title: "First-Piece Approval Time",
  },
  "quality-hourly": { group: "daily", title: "Hourly Check Completion" },
  "quality-daily-defects": { group: "daily", title: "Defect-wise Rejections" },
  "quality-inspector-count": {
    group: "inspectors",
    title: "First-Piece Approvals by Inspector",
  },
  "quality-inspector-time": {
    group: "inspectors",
    title: "Average Approval Time by Inspector",
  },
  "quality-machine-percent": {
    group: "machines",
    title: "Rejection % by Machine",
  },
  "quality-machine-pieces": {
    group: "machines",
    title: "Rejected Pieces by Machine",
  },
  "quality-defect-pieces": {
    group: "defects",
    title: "Rejected Pieces by Defect",
  },
  "quality-shift-production": {
    group: "shifts",
    title: "Production Quality by Shift",
  },
  "quality-shift-first-piece": {
    group: "shifts",
    title: "First-Piece Status by Shift",
  },
  "quality-shift-time": {
    group: "shifts",
    title: "Average Approval Time by Shift",
  },
  "quality-shift-hourly": { group: "shifts", title: "Hourly Checks by Shift" },
  "quality-shift-defects": { group: "shifts", title: "Defects by Shift" },
} as const
export type QualityChartId = keyof typeof qualityCharts
export function isQualityChartId(value: string): value is QualityChartId {
  return Object.hasOwn(qualityCharts, value)
}
export function qualityReportFloors(access: UnifiedNavigationAccess) {
  if (!access.operations) return []
  return productionFloors.filter((floor) => {
    const tabs = access.productionFloorTabIds?.[floor.code] ?? []
    return (
      tabs.includes("qualityControlTasksTab") &&
      tabs.includes("firstPieceInspectionTab")
    )
  })
}
export const qualityReportNavigation = Object.entries(qualityReportGroups).map(
  ([id, label]) => ({ label, href: `/home/quality/${id}` })
)
