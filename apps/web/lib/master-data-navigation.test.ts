import { expect, it } from "vitest"

import type { UnifiedNavigationAccess } from "./auth/unified-navigation-access"
import { masterDataNavigationLinks } from "./master-data-navigation"
import { availableMainMasters, masterFormHref, masterModuleAccess, resolveMasterSelection, subMastersFor } from "./master-module"

const access = {
  administration: false,
  commercialHrefs: [],
  hrHrefs: [],
  masterReadKeys: [],
  operations: true,
  productionTabIds: ["productionDashboardTab"],
  store: false,
} satisfies UnifiedNavigationAccess

it("hides Master Data navigation without a master read grant", () => {
  expect(masterDataNavigationLinks(access)).toEqual([])
  expect(
    masterDataNavigationLinks({
      ...access,
      masterReadKeys: ["masters.cnc.machine_master.read"],
    })
  ).toHaveLength(1)
})

it("opens Existing Stock as a Store master using existing receipt access", () => {
  const permitted = { ...access, existingStockEntry: true }
  expect(masterDataNavigationLinks(permitted)).toHaveLength(1)
  const modules = masterModuleAccess(permitted)
  expect(availableMainMasters("universal", modules)).toContainEqual({ id: "store_masters", label: "Store" })
  expect(subMastersFor("store_masters", modules)?.options).toContainEqual({ id: "EXISTING_STOCK", label: "Add Existing Stock Entry" })
  const selection = { main: "store_masters", sub: "EXISTING_STOCK", unit: "universal" as const }
  expect(resolveMasterSelection(selection, modules)).toEqual(selection)
  expect(masterFormHref(selection)).toContain("/masters/store/existing-stock?")
  expect(resolveMasterSelection(selection, masterModuleAccess(access))).toBeNull()
})
