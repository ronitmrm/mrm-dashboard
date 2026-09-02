import { describe, expect, test } from "vitest"

import {
  maintenanceCapabilities,
  maintenanceNavigationAccess,
} from "./maintenance-capabilities"

describe("maintenance capability contract", () => {
  test("keeps manager decisions separate from each trade's work access", () => {
    expect(maintenanceCapabilities).toEqual({
      manager: "maintenance.requests.manage",
      trades: {
        Electrical: "maintenance.trade.electrical.work",
        Mechanical: "maintenance.trade.mechanical.work",
        Plumbing: "maintenance.trade.plumbing.work",
      },
    })
  })

  test("maps protected Maintenance pages to the narrow capability", () => {
    expect(maintenanceNavigationAccess).toEqual([
      ["/maintenance/approval", "maintenance.requests.manage"],
      ["/maintenance/electrical", "maintenance.trade.electrical.work"],
      ["/maintenance/plumbing", "maintenance.trade.plumbing.work"],
      ["/?tab=maintenanceTab", "maintenance.workspace.read"],
    ])
  })
})
