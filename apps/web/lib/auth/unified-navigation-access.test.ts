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
