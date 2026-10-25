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
    expect(view.productionControl).toEqual({ rmInwardRows: [selected], jobCardActivityOptions: [{ jcNo: "private" }] })
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

  it("keeps historical FG rejection revisions in Rework Received and rejects the removed entry", () => {
    const rejected = { jcNo: "JC-1 · Rev 1 · Replacement", receiptType: "fg_rejected", isRevision: true, productionFloorCode: "cnc" }
    const payload = { productionControl: { workOrders: [
      { jcNo: "JC-1", dispatchedPieces: 10, productionFloorCode: "cnc" },
      { jcNo: "NOT-DISPATCHED", dispatchedPieces: 0, productionFloorCode: "cnc" },
      { jcNo: "OTHER-UNIT", dispatchedPieces: 5, productionFloorCode: "forging" },
      { jcNo: "CANCELLED", dispatchedPieces: 5, status: "Cancelled", productionFloorCode: "cnc" },
      rejected,
      { jcNo: "REWORK", isRevision: true, productionFloorCode: "cnc" },
    ] } }
    expect(operationalEntrySnapshot(payload, "rework_received", "cnc").productionControl)
      .toMatchObject({ workOrders: [rejected, { jcNo: "REWORK", isRevision: true, productionFloorCode: "cnc" }] })
    expect(() => operationalEntryWriteScope("fg_rejected", "save", "cnc", {}))
      .toThrow("valid operational entry")
  })
})
