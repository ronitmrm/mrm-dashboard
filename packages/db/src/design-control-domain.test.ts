import { describe, expect, test } from "vitest"

import {
  assertApplicableProcessPrices,
  classifyDesignCostImpact,
  designProcessSelection,
  drawingRevisionLabel,
  engineeringChangeStatusAfterApproval,
  processesRequiredFromPayload,
  processFieldIsApplicable,
} from "./design-control-domain"

describe("Design control domain", () => {
  test("uses the released dossier selection instead of current process prices", () => {
    const selected = designProcessSelection({
      processesRequired: ["Washing", "Annealing"],
    })

    expect([...selected]).toEqual(["annealing", "washing"])
    expect(() =>
      assertApplicableProcessPrices({
        current: { plating: 0, washing: 10 },
        next: { plating: 25, washing: 12 },
        selectedProcesses: selected,
      })
    ).toThrow("Plating is not selected in the released Design BOM")
  })

  test("reads only canonical Design process selection for database fields", () => {
    const selected = designProcessSelection({
      processesRequired: processesRequiredFromPayload({
        processesRequired: ["Machining", "Package Assembly"],
        process_required: "Washing",
      }),
    })

    expect(processFieldIsApplicable("machining_cost", selected)).toBe(true)
    expect(processFieldIsApplicable("assembly_operation_cost", selected)).toBe(
      true
    )
    expect(processFieldIsApplicable("washing", selected)).toBe(false)
    expect(processesRequiredFromPayload({ process_required: "Washing" })).toEqual(
      []
    )
  })

  test("formats sequential drawing revisions with a minimum of two digits", () => {
    expect(drawingRevisionLabel(0)).toBe("00")
    expect(drawingRevisionLabel(9)).toBe("09")
    expect(drawingRevisionLabel(105)).toBe("105")
  })

  test("classifies canonical cost-driver changes independently of descriptions", () => {
    expect(
      classifyDesignCostImpact(
        { description: "Old", weight100Pcs: 100 },
        { description: "New", weight100Pcs: 100 }
      )
    ).toEqual({ costImpacting: false, drivers: [] })
    expect(
      classifyDesignCostImpact(
        { processesRequired: ["Washing"], weight100Pcs: 100 },
        { processesRequired: ["Washing", "Plating"], weight100Pcs: 120 }
      )
    ).toEqual({
      costImpacting: true,
      drivers: ["processesRequired", "weight100Pcs"],
    })
    expect(
      classifyDesignCostImpact(
        { bom: [{ componentItemId: "a", quantity: 1 }] },
        { bom: [{ componentItemId: "b", quantity: 1 }] }
      )
    ).toEqual({ costImpacting: true, drivers: ["bom"] })
  })

  test("routes approved cost changes through both costing stages", () => {
    expect(engineeringChangeStatusAfterApproval(false)).toBe("Completed")
    expect(engineeringChangeStatusAfterApproval(true)).toBe(
      "Pending Product Costing"
    )
  })
})
