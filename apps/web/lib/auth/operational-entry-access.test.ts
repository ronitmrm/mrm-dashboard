import { describe, expect, it } from "vitest"
import {
  operationalEntrySnapshot,
  operationalEntryWriteScope,
} from "./operational-entry-access"

describe("scoped operational entry access", () => {
  it("returns only the selected entry and unit, from both saved and projected rows", () => {
    const selected = {
      entryType: "rm_inward",
      productionFloorCode: "cnc",
      rmPoNo: "RM-1",
    }
    const view = operationalEntrySnapshot(
      {
        productionFloorCode: "cnc",
        dataEntry: {
          rows: [
            selected,
            { ...selected, productionFloorCode: "forging" },
            { entryType: "work_order", jcNo: "private" },
          ],
        },
        productionControl: {
          rmInwardRows: [
            selected,
            { ...selected, productionFloorCode: "forging" },
          ],
          workOrders: [{ jcNo: "private" }],
        },
        employeeMaster: [{ name: "private" }],
      },
      "rm_inward",
      "cnc"
    )
    expect(view.dataEntry.rows).toEqual([selected])
    expect(view.productionControl).toEqual({ rmInwardRows: [selected] })
    expect(view).not.toHaveProperty("employeeMaster")
  })

  it("rejects invalid units and a different unit hidden in the submitted payload", () => {
    expect(() =>
      operationalEntryWriteScope("work_order", "save", "invalid", {})
    ).toThrow("Production Unit")
    expect(() =>
      operationalEntryWriteScope("work_order", "save", "cnc", {
        productionFloorCode: "forging",
      })
    ).toThrow("selected Production Unit")
    expect(
      operationalEntryWriteScope("work_order", "save", "cnc", {}).capability
    ).toBe("entries.cnc.work_order.save")
    expect(
      operationalEntryWriteScope("rm_inward", "import", "forging", {})
        .capability
    ).toBe("entries.forging.rm_inward.import")
  })
})
