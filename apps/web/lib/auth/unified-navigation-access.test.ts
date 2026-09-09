import { beforeEach, expect, it, vi } from "vitest"

const authorization = vi.hoisted(() => ({ granted: [] as string[] }))
vi.mock("./require-capability", () => ({
  listGrantedCapabilities: async (_userId: string, requested: string[]) =>
    authorization.granted.filter((key) => requested.includes(key)),
}))
vi.mock("../production-module", () => ({
  productionModuleIsEnabled: () => true,
}))

import { getUnifiedNavigationAccess } from "./unified-navigation-access"

beforeEach(() => {
  authorization.granted = []
})

it("does not advertise unit pages through legacy production grants", async () => {
  authorization.granted = [
    "operations.dashboard.read",
    "planning.planner_actions.read",
  ]
  const access = await getUnifiedNavigationAccess("legacy-floor-user")
  expect(Object.values(access.productionFloorTabIds ?? {}).flat()).toEqual([])
  expect(access.operations).toBe(false)
})

it("uses the current master grants for commercial and HR destinations", async () => {
  authorization.granted = [
    "pricing.customers.read",
    "pricing.website_products.read",
    "hr.employees.read",
    "hr.recruitment.read",
  ]
  const legacy = await getUnifiedNavigationAccess("legacy-master-user")
  expect(legacy.commercialHrefs).not.toContain("/commercial/customers")
  expect(legacy.commercialHrefs).not.toContain("/commercial/website-products")
  expect(legacy.hrHrefs).not.toContain("/hr?panel=employeeMasterPanel")
  expect(legacy.hrHrefs).not.toContain("/hr?panel=approvedPostPanel")
  expect(legacy.hrHrefs).toContain("/hr?panel=jobsPanel")

  authorization.granted = [
    "masters.universal.commercial_customers.read",
    "masters.universal.employee_assignments.read",
  ]
  const scoped = await getUnifiedNavigationAccess("scoped-master-user")
  expect(scoped.commercialHrefs).toContain("/commercial/customers")
  expect(scoped.hrHrefs).toEqual(["/hr?panel=employeeMasterPanel"])
})

it("opens operational navigation only for independent scoped entry reads", async () => {
  authorization.granted = [
    "operations.operational_entry.read",
    "operations.dashboard.read",
  ]
  const legacy = await getUnifiedNavigationAccess("legacy-user")
  expect(legacy.productionTabIds).not.toContain("operationalEntryTab")
  expect(legacy.productionTabIds).not.toContain("operationalTablesTab")
  expect(legacy.operationalEntryReadKeys).toEqual([])

  authorization.granted = [
    "entries.cnc.work_order.read",
    "entries.forging.rm_inward.save",
  ]
  const scoped = await getUnifiedNavigationAccess("scoped-user")
  expect(scoped.productionTabIds).toEqual([
    "operationalEntryTab",
    "operationalTablesTab",
  ])
  expect(scoped.operationalEntryReadKeys).toEqual([
    "entries.cnc.work_order.read",
  ])
})
