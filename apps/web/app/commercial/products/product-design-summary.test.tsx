import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, test } from "vitest"

import { ProductDesignSummary } from "./product-design-summary"

const dossier = {
  blankPieceWeight: 22,
  bom: [
    {
      blankPieceWeight: 18,
      category: "Hardware",
      componentItemId: "item-2",
      componentUid: "M2",
      depth: 1,
      description: "Nut",
      drawingRequirement: "Required",
      grade: "CW614N",
      itemType: "List",
      lineNumber: 1,
      notes: null,
      parentUid: "M1",
      parentLineNumber: null,
      processesRequired: ["Machining"],
      productSize: "M8",
      productType: "Barstock",
      productionType: "CNC",
      quantity: 2,
      rodSize: "12 Hex",
      rodType: "Solid",
      subCategory: "Nut",
      totalQuantity: 2,
      weight: 10,
    },
  ],
  category: "Hydraulics",
  description: "Package assembly",
  designTaskEnquiryItemId: "enquiry-item-1",
  design: {
    releasedAt: new Date("2026-09-01T00:00:00Z"),
    revision: "01",
    status: "Released",
  },
  dieCode: "D-1",
  drawing: null,
  itemType: "Package",
  latestEcn: null,
  processesRequired: ["Washing"],
  productSize: "1/4 inch",
  productType: "Barstock",
  productWeight: 20,
  productionType: "CNC",
  revisionHistory: [
    {
      approvedAt: new Date("2026-09-01T00:00:00Z"),
      approvedBy: "Design HOD",
      changeReason: "Thread update",
      current: true,
      ecnId: "ecn-1",
      ecnNumber: "ECN-1",
      effectiveOn: "2026-09-01",
      releasedAt: new Date("2026-09-01T00:00:00Z"),
      revision: "01",
      status: "Released",
    },
    {
      approvedAt: null,
      approvedBy: null,
      changeReason: "Initial Release",
      current: false,
      ecnId: null,
      ecnNumber: null,
      effectiveOn: "2026-08-01",
      releasedAt: new Date("2026-08-01T00:00:00Z"),
      revision: "00",
      status: "Superseded",
    },
  ],
  rodSize: "16 Round",
  rodType: "Solid",
  subCategory: "Assembly",
  uid: "M1",
}

describe("ProductDesignSummary", () => {
  test("shows complete design fields, recursive BOM, and current/historical revision actions without pricing", () => {
    const markup = renderToStaticMarkup(
      <ProductDesignSummary dossier={dossier} />
    )

    for (const value of [
      "Product Weight",
      "Blank-piece Weight",
      "Rod Size",
      "Die Code",
      "Product Type",
      "Production Type",
      "M2",
      "Total Qty.",
      "Design Revision History",
    ]) {
      expect(markup).toContain(value)
    }
    expect(markup).toContain('href="/commercial/products/M1/design"')
    expect(markup).toContain('href="/commercial/products/M1/revisions/00"')
    expect(markup).not.toContain("Pricing")
    expect(markup).not.toContain("Product Cost")
  })
})
