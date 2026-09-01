import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { EcnDesignWorkspace } from "./ecn-design-workspace"

describe("ECN Design workspace", () => {
  it("renders the complete Product, BOM, Files, and Design Controls workspace", () => {
    const markup = renderToStaticMarkup(
      <EcnDesignWorkspace
        dossier={{
          bomLines: [],
          casting: 47.76,
          category: "Adapter",
          checkedBy: null,
          description: "Male adapter",
          designRemarks: null,
          dieCode: null,
          ecnNumber: "ECN-0001",
          fixtureApproxCost: 0,
          fixtureRequired: "No",
          gaugesRequired: "No",
          id: "ecn-1",
          inspectionApproxCost: 0,
          itemId: "item-1",
          itemType: "List",
          itemUid: "M1",
          operationNotes: null,
          productionType: "Conventional",
          productSize: "1/4 X 1/4",
          reason: "Revise design",
          remarks: null,
          rodSize: "16",
          status: "Pending Design",
          subcategory: "Male Adapter",
          targetCompletionDate: null,
          toolingApproxCost: 0,
          toolingRequired: "No",
          weight100Pcs: 25,
        }}
        products={[]}
      />
    )

    for (const tab of ["Product Details", "BOM", "Files", "Design Controls"]) {
      expect(markup).toContain(tab)
    }
    expect(markup).toContain('name="description"')
    expect(markup).toContain('name="bom_mode"')
    expect(markup).toContain('name="design_remarks"')
    expect(markup).toContain("Complete ECN Design")
  })
})
