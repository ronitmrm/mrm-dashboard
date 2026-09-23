import { expect, it } from "vitest"

import type { UnifiedNavigationAccess } from "./auth/unified-navigation-access"
import { masterDataNavigationLinks } from "./master-data-navigation"

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
