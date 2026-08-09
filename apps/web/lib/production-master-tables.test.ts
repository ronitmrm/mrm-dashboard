import { describe, expect, it } from "vitest"

import { rowsForProductionMaster } from "./production-master-tables"

describe("Production master table rows", () => {
  it("does not show rows explicitly belonging to another master", () => {
    const route = { entryType: "route", partNo: "P-1" }
    const machine = { entryType: "machine_master", machineNo: "1" }
    const legacyRoute = { partNo: "P-2" }

    expect(
      rowsForProductionMaster("route", [route, machine, legacyRoute])
    ).toEqual([route, legacyRoute])
  })
})
