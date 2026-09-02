import type { MaintenanceCategory } from "@workspace/db/maintenance-request-domain"

export const maintenanceCapabilities = {
  manager: "maintenance.requests.manage",
  trades: {
    Electrical: "maintenance.trade.electrical.work",
    Mechanical: "maintenance.trade.mechanical.work",
    Plumbing: "maintenance.trade.plumbing.work",
  },
} as const satisfies {
  manager: string
  trades: Record<MaintenanceCategory, string>
}

export const maintenanceNavigationAccess = [
  ["/maintenance/approval", maintenanceCapabilities.manager],
  ["/maintenance/electrical", maintenanceCapabilities.trades.Electrical],
  ["/maintenance/plumbing", maintenanceCapabilities.trades.Plumbing],
  ["/?tab=maintenanceTab", "maintenance.workspace.read"],
] as const
