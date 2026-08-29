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
  machineTypes: ["CNC", "Conventional", "DP", "M/C Assembly", "Assembly"],
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
  test("starts a Package BOM with its visible Package parent", () => {
    const markup = renderToStaticMarkup(
      <DesignTaskEditor
        designOptions={designOptions}
        editable
        initial={initial}
        products={[]}
      />
    )

    expect(markup).toContain("Package Parent")
    expect(markup).toContain("Add Component Line")
    expect(markup.indexOf("Package Parent")).toBeLessThan(
      markup.indexOf("BOM Line 1")
    )
  })

  test("separates root and BOM-line drawings into file tabs", () => {
    const markup = renderToStaticMarkup(
      <DesignTaskEditor
        attachments={[
          {
            fileName: "line-1-internal.pdf",
            href: "/commercial/design/design-1/file/bom_line_1_internal_drawing",
            purpose: "bom_line_1_internal_drawing",
          },
        ]}
        designOptions={designOptions}
        editable
        initial={initial}
        products={[]}
      />
    )

    expect(markup).toContain('aria-label="Design file groups"')
    expect(markup).toContain("Package Files")
    expect(markup).toContain("BOM Line 1 Files")
    expect(markup).toContain('name="internal_drawing_file"')
    expect(markup).toContain('name="bom_line_1_internal_drawing_file"')
    expect(markup).toContain('name="bom_line_1_customer_marked_file"')
    expect(markup).toContain('name="bom_line_1_cad_file"')
    expect(markup).toContain("line-1-internal.pdf")
    expect(markup).toContain(
      'href="/commercial/design/design-1/file/bom_line_1_internal_drawing"'
    )
  })

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

  test("shows an Existing Product's canonical BOM details read-only", () => {
    const markup = renderToStaticMarkup(
      <DesignTaskEditor
        designOptions={designOptions}
        editable
        initial={{
          ...initial,
          bomLines: [
            {
              componentCode: "",
              componentItemType: "List",
              componentSource: "Existing",
              existingProductId: "product-25",
              lineNumber: 1,
              quantity: 2,
            },
          ],
        }}
        products={[
          {
            blankPieceWeight: 50.5,
            category: "Compression Fitting",
            description: "Existing Male Adapter",
            grade: "C3604",
            id: "product-25",
            itemType: "List",
            lineNotes: "Use approved route",
            pieceWeight: 23.52,
            processRequired: "Washing, Plating",
            productSize: "1/4 X 3/8",
            productType: "Barstock",
            productionType: "CNC",
            rodSize: "16 Round",
            rodType: "Solid",
            subcategory: "Male Compression Adapter",
            uid: "M25",
          },
        ]}
      />
    )

    expect(markup).toContain('value="M25"')
    expect(markup).toContain('value="Existing Male Adapter"')
    expect(markup).toContain('value="1/4 X 3/8"')
    expect(markup).toContain('value="Compression Fitting"')
    expect(markup).toContain('value="Male Compression Adapter"')
    expect(markup).toContain('value="16 Round"')
    expect(markup).toContain('value="C3604"')
    expect(markup).toContain('value="Barstock"')
    expect(markup).toContain('value="CNC"')
    expect(markup).toContain('value="50.5"')
    expect(markup).toContain('value="23.52"')
    expect(markup).toContain('value="Washing, Plating"')
    expect(markup).toContain('value="Use approved route"')
    expect(markup).toContain(
      'type="hidden" name="bom_component_product_size" value="1/4 X 3/8"'
    )
    expect(markup).toContain(
      'type="hidden" name="bom_production_type" value="Barstock"'
    )
    expect(markup).toContain(
      'type="hidden" name="bom_manufacturing_process" value="CNC"'
    )
    expect(markup).toContain(
      'type="hidden" name="bom_notes" value="Use approved route"'
    )
    expect(markup).toContain('type="hidden" name="bom_rod_size"')
    expect(markup).toContain('type="hidden" name="bom_process_required"')
  })

  test("selects a BOM line from Product Portfolio without an inline product dropdown", () => {
    const markup = renderToStaticMarkup(
      <DesignTaskEditor
        designOptions={designOptions}
        editable
        initial={initial}
        portfolioSelection={{ lineIndex: 0, productUid: "M25" }}
        products={[
          {
            blankPieceWeight: 50.5,
            category: "Compression Fitting",
            description: "Existing Male Adapter",
            grade: "C3604",
            id: "product-25",
            itemType: "List",
            lineNotes: "Use approved route",
            pieceWeight: 23.52,
            processRequired: "Washing, Plating",
            productSize: "1/4 X 3/8",
            productType: "Barstock",
            productionType: "CNC",
            rodSize: "16 Round",
            rodType: "Solid",
            subcategory: "Male Compression Adapter",
            uid: "M25",
          },
        ]}
      />
    )

    expect(markup).toContain("Selected Product")
    expect(markup).toContain("Change Product from Portfolio")
    expect(markup).toContain('value="portfolio:0"')
    expect(markup).toContain(
      'type="hidden" name="bom_component_source" value="Existing"'
    )
    expect(markup).toContain(
      'type="hidden" name="bom_existing_product_id" value="product-25"'
    )
    expect(markup).not.toContain(
      'class="w-full" name="bom_existing_product_id"'
    )
    expect(markup).toContain("Parent Assembly (optional)")
    expect(markup).toContain("Top-level component — no parent required")
  })

  test("gives Assembly components Product identity and enables them as parents for following rows", () => {
    const markup = renderToStaticMarkup(
      <DesignTaskEditor
        designOptions={designOptions}
        editable
        initial={{
          ...initial,
          bomLines: [
            {
              componentCategory: "Fitting",
              componentCode: "",
              componentItemType: "Assembly",
              componentProductSize: "3/8",
              componentSource: "New",
              componentSubcategory: "Adapter",
              lineNumber: 1,
              manufacturingProcess: "M/C Assembly",
              pieceWeight: 999,
              processRequired: "Washing, Marking",
              quantity: 1,
            },
            {
              componentCode: "",
              componentItemType: "List",
              componentSource: "New",
              lineNumber: 2,
              parentLineNumber: 1,
              pieceWeight: 3,
              quantity: 2,
            },
            {
              componentCode: "",
              componentItemType: "List",
              componentSource: "New",
              lineNumber: 3,
              parentLineNumber: 1,
              pieceWeight: 5,
              quantity: 4,
            },
          ],
        }}
        products={[]}
      />
    )

    expect(markup).toContain('name="bom_component_product_size" value="3/8"')
    expect(markup).toContain("Product Name (automatic)")
    expect(markup).toContain('value="3/8 Fitting Adapter"')
    expect(markup).toContain("Child of Assembly line 1")
    expect(markup).toContain("Add List Part")
    expect(markup).toContain("Assembly Weight (derived)")
    expect(markup).toContain('value="26"')
    expect(markup).not.toContain('value="999"')
    expect(markup).not.toContain(
      "Select a parent only when this component sits inside an earlier Assembly line."
    )
    const childLineMarkup = markup.slice(
      markup.indexOf("BOM Line 2"),
      markup.indexOf("BOM Line 3")
    )
    expect(childLineMarkup).toContain(
      'type="hidden" name="bom_component_item_type" value="List"'
    )
    const assemblyLineMarkup = markup.slice(
      markup.indexOf("BOM Line 1"),
      markup.indexOf("BOM Line 2")
    )
    expect(assemblyLineMarkup).toContain("Production Type")
    expect(assemblyLineMarkup).toContain("M/C Assembly")
    expect(assemblyLineMarkup).toContain("Pricing Process Columns Required")
    expect(assemblyLineMarkup).toContain(
      'name="bom_process_required" value="Washing, Marking"'
    )
  })
})
