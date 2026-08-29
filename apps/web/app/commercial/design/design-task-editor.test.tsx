import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, test } from "vitest"

import { DesignTaskEditor } from "./design-task-editor"

const initial = {
  bomLines: [
    {
      componentCode: "",
      componentItemType: "List",
      componentSource: "New",
      lineNumber: 1,
      quantity: 1,
    },
  ],
  checkedBy: null,
  componentsRequired: "Yes",
  designBomCompleted: "Yes",
  designRemarks: null,
  designerName: "Designer",
  fixtureApproxCost: 0,
  fixtureRequired: "No",
  gaugesRequired: "No",
  inspectionApproxCost: 0,
  internalPartCategory: "Fitting",
  internalPartSize: "1/4",
  internalPartSubCategory: "Adapter",
  itemType: "Package",
  manufacturingProcess: "CNC",
  matchedProductId: null,
  operationNotes: null,
  packageProcessRequired: "Assembly",
  portfolioMatchStatus: "New Quoted Part",
  quotedPartUid: "Q1",
  targetCompletionDate: "2026-08-29",
  toolingApproxCost: 0,
  toolingRequired: "No",
}

const designOptions = {
  categories: ["Fitting"],
  designers: ["Designer"],
  machineTypes: ["CNC", "Conventional", "DP"],
  materialGrades: ["C3604"],
  processes: [
    "Barstock",
    "Forged",
    "Moulded",
    "Punching",
    "Forging",
    "CNC",
    "Conventional",
  ],
  rodSizes: ["14.29 Hex SC"],
  rodTypes: ["Solid"],
  subcategories: [{ category: "Fitting", name: "Adapter" }],
}

describe("DesignTaskEditor", () => {
  test("keeps read-only tabs navigable and asks each new Package List component for Product identity", () => {
    const markup = renderToStaticMarkup(
      <DesignTaskEditor
        designOptions={designOptions}
        editable={false}
        initial={initial}
        products={[]}
      />
    )

    expect(markup.indexOf('role="tablist"')).toBeLessThan(
      markup.indexOf('disabled=""')
    )
    expect(markup).not.toContain("Package Process")
    expect(markup).not.toContain("Components Required?")
    expect(markup).toContain("Product Size")
    expect(markup).toContain("Component Category")
    expect(markup).toContain("Component Subcategory")
    expect(markup).toContain("Product Name (automatic)")
    expect(markup).toContain("Blank Piece Weight ( gm )")
    expect(markup).not.toContain('name="manufacturing_process"')
    expect(markup).toContain('name="bom_manufacturing_process"')
    expect(markup).toContain('value="DP">DP</option>')
    expect(markup).toContain('value="Forged">Forged</option>')
    expect(markup).toContain('value="Moulded">Moulded</option>')
    expect(markup).toContain('value="Punching">Punching</option>')
    expect(markup).not.toContain('value="Forging">Forging</option>')
  })
})
