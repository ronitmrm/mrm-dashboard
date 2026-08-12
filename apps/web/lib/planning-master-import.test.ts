import { describe, expect, it } from "vitest"

import {
  firstDuplicateRouteSetup,
  firstMissingPlanningItemRow,
  machineMasterImportPayload,
  planningImportRowError,
  planningImportValidationError,
  workOrderNumberForPayload,
} from "./planning-master-import"

describe("planning master CSV imports", () => {
  const rows = [
    { partNo: "M4", optionNumber: "1", setupNo: "5" },
    { partNo: "M5", optionNumber: "1", setupNo: "3" },
    { partNo: "M2B", optionNumber: "1", setupNo: "4" },
  ]

  it("identifies the original CSV row for a missing Product Master item", () => {
    expect(firstMissingPlanningItemRow(rows, ["m2b"])).toEqual({
      csvRow: 4,
      itemUid: "M2B",
    })
  })

  it("adds row and route context to a database failure", () => {
    expect(
      planningImportRowError(
        "route",
        2,
        rows[2]!,
        new Error("Planning item was not found.")
      )
    ).toBe(
      "Route CSV row 4 (product M2B, option 1, setup 4): Planning item was not found."
    )
  })

  it("reports reversed route setup columns without requiring Product Master", () => {
    const invalidRows = [
      { partNo: "M4", optionNumber: "1", setupNo: "5", numberOfSetups: "1" },
      { partNo: "M4", optionNumber: "1", setupNo: "5", numberOfSetups: "2" },
      { partNo: "M2B", optionNumber: "1", setupNo: "4", numberOfSetups: "1" },
    ]

    expect(firstDuplicateRouteSetup(invalidRows)).toMatchObject({
      csvRows: [2, 3],
      itemUid: "M4",
      optionNumber: "1",
      setupNumber: "5",
    })
    expect(planningImportValidationError("route", invalidRows, ["M2B"])).toBe(
      "Route CSV needs correction before import. CSV rows 2 and 3 repeat setup 5 for product M4, option 1. Each setup number must be unique; the setupNo and numberOfSetups columns appear reversed in this file."
    )
  })

  it("requires a Route Master before importing cycle rows", () => {
    expect(planningImportValidationError("cycle", rows, ["M2B"])).toBe(
      'Cycle CSV needs correction before import. CSV row 4: Part "M2B" has no Route Master. Import its Route Master first, then import this file again.'
    )
  })

  it("uses each Machine Master row's Production Unit", () => {
    expect(
      machineMasterImportPayload(
        {
          machineNo: "A304",
          productionUnit: "Prduction Planning & Control Conventional-02",
        },
        "conventional"
      )
    ).toMatchObject({
      machineNo: "A304",
      productionFloorCode: "conventional-02",
    })
  })

  it("accepts the user-facing Production Unit CSV heading", () => {
    expect(
      machineMasterImportPayload(
        {
          machineNo: "A305",
          "Production Unit": "Production Planning & Control Conventional-02",
        },
        "conventional"
      )
    ).toMatchObject({
      machineNo: "A305",
      productionFloorCode: "conventional-02",
    })
  })

  it("uses FG PO and Part Code together as the unique Work Order line", () => {
    expect(workOrderNumberForPayload({ fgPoNo: "FG-001", jcNo: "JC-001", partCode: "M2B" })).toBe(
      "FG-001::M2B"
    )
    expect(workOrderNumberForPayload({ fgPoNo: "FG-001", jcNo: "JC-002", partCode: "M3" })).toBe(
      "FG-001::M3"
    )
  })

  it("rejects repeated Job Cards and repeated FG PO plus Part Code lines", () => {
    const invalidRows = [
      { fgPoNo: "FG-001", jcNo: "JC-001", partCode: "M2B" },
      { fgPoNo: "FG-002", jcNo: "JC-001", partCode: "M3" },
      { fgPoNo: " fg-001 ", jcNo: "JC-003", partCode: " m2b " },
    ]

    expect(planningImportValidationError("work_order", invalidRows, [])).toBe(
      "Work order CSV needs correction before import. CSV rows 2 and 3 repeat Job Card JC-001. Each Job Card must identify exactly one line. CSV rows 2 and 4 repeat FG PO FG-001 with Part Code M2B. That combination may appear only once in a Work Order."
    )
  })
})
