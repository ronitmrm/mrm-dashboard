import { describe, expect, test } from "vitest"

import {
  designItemType,
  designProductTypeOptions,
  designProductionTypeOptions,
  designPortfolioDecisions,
  designTaskSavedHref,
  designTaskSaveResultHref,
  designStatuses,
  designTaskHref,
  designTaskShouldPrepareCosting,
  designTaskStatusAfterStart,
  designTaskIsEditable,
  designTaskIsOpen,
  designTaskCompletionMissingFields,
  designProductName,
  deriveDesignTaskState,
  normalizeDesignAllocatedUid,
} from "@workspace/db/commercial-design-domain"

describe("Pricing Design Task contract", () => {
  test("limits Production Type to CNC, Conventional, and DP master values", () => {
    expect(designProductionTypeOptions(["Conventional", "DP", "CNC"])).toEqual([
      "CNC",
      "Conventional",
      "DP",
    ])
  })

  test("limits Product Type to the four approved master values", () => {
    expect(
      designProductTypeOptions([
        "CNC",
        "Punching",
        "Barstock",
        "Forging",
        "Moulded",
        "Conventional",
        "Forged",
      ])
    ).toEqual(["Barstock", "Forged", "Moulded", "Punching"])
  })

  test("keeps an explicitly selected List as a List on draft save", () => {
    expect(
      designItemType({
        bomLines: [
          {
            componentItemType: "List",
            packagePart: "generated display name",
          },
        ],
        requestedItemType: "List",
      })
    ).toBe("List")
  })

  test("builds the Product Name in Pricing order", () => {
    expect(
      designProductName({
        category: "Flare Fitting",
        size: "1/4 X 1/4",
        subcategory: "Male Flare X Male Nptf Adapter",
      })
    ).toBe("1/4 X 1/4 Flare Fitting Male Flare X Male Nptf Adapter")
  })

  test("hands a completed Design task to Product Costing on save", () => {
    expect(
      designTaskShouldPrepareCosting({
        completionRequested: false,
        designBomCompleted: "Yes",
        nextStageStatus: "Not Started",
      })
    ).toBe(false)
    expect(
      designTaskShouldPrepareCosting({
        designBomCompleted: "Yes",
        nextStageStatus: "Not Started",
      })
    ).toBe(true)
    expect(
      designTaskShouldPrepareCosting({
        designBomCompleted: "No",
        nextStageStatus: "Not Started",
      })
    ).toBe(false)
    expect(
      designTaskShouldPrepareCosting({
        designBomCompleted: "Yes",
        nextStageStatus: "Product Costing",
      })
    ).toBe(false)
  })

  test("returns to the workspace with visible save confirmation state", () => {
    expect(designTaskSavedHref("line-1")).toBe(
      "/commercial/design/line-1/new?saved=1"
    )
    expect(designTaskSavedHref("line-1", "files")).toBe(
      "/commercial/design/line-1/new?saved=1&section=files"
    )
    expect(normalizeDesignAllocatedUid("Allocated on save")).toBeNull()
    expect(normalizeDesignAllocatedUid(" Q-100 ")).toBe("Q-100")
  })

  test("closes a successfully completed Design form and returns to the queue", () => {
    expect(
      designTaskSaveResultHref({
        completionMissingFields: [],
        completionRequested: true,
        enquiryItemId: "line-1",
        section: "controls",
      })
    ).toBe("/commercial/design")

    expect(
      designTaskSaveResultHref({
        completionMissingFields: ["Package requires at least 2 BOM Lines"],
        completionRequested: true,
        enquiryItemId: "line-1",
        section: "controls",
      })
    ).toBe(
      "/commercial/design/line-1/new?incomplete=Package+requires+at+least+2+BOM+Lines&saved=1#design-completion-remark"
    )
  })

  test("routes portfolio review before a separate new-design workspace", () => {
    expect(
      designTaskHref({
        enquiryItemId: "line-1",
        portfolioMatchStatus: "Pending",
      })
    ).toBe("/commercial/design/line-1")
    expect(
      designTaskHref({
        enquiryItemId: "line-1",
        portfolioMatchStatus: "New Quoted Part",
      })
    ).toBe("/commercial/design/line-1/new")
  })

  test("starts only an available design task", () => {
    expect(designTaskStatusAfterStart("Pending Design")).toBe("In Progress")
    expect(designTaskStatusAfterStart("In Progress")).toBe("In Progress")
    expect(designTaskStatusAfterStart("Changes Required")).toBe(
      "Changes Required"
    )
    expect(() => designTaskStatusAfterStart("Need Clarification")).toThrow(
      "Design work cannot start"
    )
  })

  test("preserves queue, lock, and save-state transitions", () => {
    expect(designStatuses).toEqual([
      "Pending Design",
      "In Progress",
      "Need Clarification",
      "Changes Required",
      "Design Complete",
      "Not Required",
    ])
    expect(designPortfolioDecisions).toEqual([
      "Pending",
      "New Quoted Part",
      "Matches Existing Portfolio",
    ])
    expect(designTaskIsOpen("Changes Required")).toBe(true)
    expect(designTaskIsOpen("Design Complete")).toBe(false)
    expect(
      designTaskIsEditable({
        designStatus: "In Progress",
        nextStageStatus: "Product Costing",
      })
    ).toBe(true)
    expect(
      designTaskIsEditable({
        designStatus: "Design Complete",
        nextStageStatus: "Product Costing",
      })
    ).toBe(false)
    expect(
      designTaskIsEditable({
        designStatus: "Design Complete",
        nextStageStatus: "Changes Required",
      })
    ).toBe(true)

    expect(
      deriveDesignTaskState({
        completionRequested: false,
        designBomCompleted: "Yes",
        existingNextStageStatus: "Not Started",
        itemType: "List",
        portfolioMatchStatus: "New Quoted Part",
      })
    ).toEqual({
      approvalStatus: "Pending",
      assemblyRequired: "No",
      designBomCompleted: "Yes",
      designBomRequired: "Yes",
      designStatus: "In Progress",
      isPortfolioMatch: false,
      nextStageStatus: "Not Started",
    })
    expect(
      deriveDesignTaskState({
        designBomCompleted: "No",
        existingNextStageStatus: "Not Started",
        itemType: "List",
        portfolioMatchStatus: "New Quoted Part",
      })
    ).toEqual({
      approvalStatus: "Pending",
      assemblyRequired: "No",
      designBomCompleted: "No",
      designBomRequired: "Yes",
      designStatus: "In Progress",
      isPortfolioMatch: false,
      nextStageStatus: "Not Started",
    })
    expect(
      deriveDesignTaskState({
        designBomCompleted: "No",
        existingNextStageStatus: "Changes Required",
        itemType: "Package",
        portfolioMatchStatus: "Matches Existing Portfolio",
      })
    ).toEqual({
      approvalStatus: "Pending",
      assemblyRequired: "No",
      designBomCompleted: "Yes",
      designBomRequired: "No",
      designStatus: "Not Required",
      isPortfolioMatch: true,
      nextStageStatus: "Product Costing Complete",
    })
  })

  test("requires the complete four-tab dossier before Design can finish", () => {
    expect(
      designTaskCompletionMissingFields({
        attachmentPurposes: [],
        bomLines: [
          {
            componentSource: "New",
            grade: null,
            lineNumber: 1,
            manufacturingProcess: null,
            packagePart: null,
            pieceWeight: null,
            productionType: null,
            processRequired: null,
            quantity: 1,
          },
        ],
        checkedBy: null,
        designBomCompleted: "Yes",
        designerName: null,
        fixtureApproxCost: 0,
        fixtureRequired: "No",
        gaugesRequired: "No",
        inspectionApproxCost: 0,
        internalPartCategory: null,
        internalPartSize: null,
        internalPartSubCategory: null,
        itemType: "List",
        manufacturingProcess: null,
        targetCompletionDate: null,
        toolingApproxCost: 0,
        toolingRequired: "No",
      })
    ).toEqual([
      "Designer",
      "Target Completion",
      "Internal Part Size",
      "Internal Category",
      "Internal Subcategory",
      "Checked By",
      "BOM Line 1 Grade",
      "BOM Line 1 Product Type",
      "BOM Line 1 Production Type",
      "BOM Line 1 1 Piece Weight ( gm )",
      "BOM Line 1 Pricing Process Columns Required",
      "Internal Drawing",
      "CAD File",
    ])

    expect(
      designTaskCompletionMissingFields({
        attachmentPurposes: ["internal_drawing", "cad"],
        bomLines: [
          {
            componentSource: "New",
            grade: "Brass",
            lineNumber: 1,
            manufacturingProcess: "Conventional",
            packagePart: null,
            pieceWeight: 12,
            productionType: "Barstock",
            processRequired: "Cutting",
            quantity: 1,
          },
        ],
        checkedBy: "Design checker",
        designBomCompleted: "Yes",
        designerName: "Design owner",
        fixtureApproxCost: 0,
        fixtureRequired: "No",
        gaugesRequired: "No",
        inspectionApproxCost: 0,
        internalPartCategory: "Valve",
        internalPartSize: "10mm",
        internalPartSubCategory: "Stem",
        itemType: "List",
        manufacturingProcess: null,
        targetCompletionDate: "2026-08-29",
        toolingApproxCost: 0,
        toolingRequired: "No",
      })
    ).toEqual([])
  })

  test("does not require Product Type or Production Type on Package Assembly rows", () => {
    expect(
      designTaskCompletionMissingFields({
        attachmentPurposes: ["internal_drawing", "cad"],
        bomLines: [1, 2].map((lineNumber) => ({
          componentItemType: "Assembly",
          componentSource: "New",
          grade: "Brass",
          lineNumber,
          manufacturingProcess: null,
          packagePart: `Assembly ${lineNumber}`,
          pieceWeight: 12,
          productionType: null,
          processRequired: "Cutting",
          quantity: 1,
        })),
        checkedBy: "Design checker",
        designBomCompleted: "Yes",
        designerName: "Design owner",
        fixtureApproxCost: 0,
        fixtureRequired: "No",
        gaugesRequired: "No",
        inspectionApproxCost: 0,
        internalPartCategory: "Valve",
        internalPartSize: "10mm",
        internalPartSubCategory: "Stem",
        itemType: "Package",
        manufacturingProcess: null,
        targetCompletionDate: "2026-08-29",
        toolingApproxCost: 0,
        toolingRequired: "No",
      })
    ).toEqual([])
  })

  test("requires at least two BOM lines for a Package", () => {
    expect(
      designTaskCompletionMissingFields({
        attachmentPurposes: ["internal_drawing", "cad"],
        bomLines: [
          {
            componentSource: "Existing",
            existingProductId: "product-1",
            lineNumber: 1,
            quantity: 1,
          },
        ],
        checkedBy: "Design checker",
        designBomCompleted: "Yes",
        designerName: "Design owner",
        fixtureApproxCost: 0,
        fixtureRequired: "No",
        gaugesRequired: "No",
        inspectionApproxCost: 0,
        internalPartCategory: "Valve",
        internalPartSize: "10mm",
        internalPartSubCategory: "Stem",
        itemType: "Package",
        manufacturingProcess: "Conventional",
        targetCompletionDate: "2026-08-29",
        toolingApproxCost: 0,
        toolingRequired: "No",
      })
    ).toEqual(["Package requires at least 2 BOM Lines"])
  })

  test("requires Product identity for every new List component in a Package", () => {
    expect(
      designTaskCompletionMissingFields({
        attachmentPurposes: ["internal_drawing", "cad"],
        bomLines: [
          {
            componentItemType: "List",
            componentSource: "New",
            grade: "C3604",
            lineNumber: 1,
            manufacturingProcess: "CNC",
            packagePart: "Generated name",
            pieceWeight: 10,
            productionType: "Barstock",
            processRequired: "Washing",
            quantity: 1,
          },
          {
            componentSource: "Existing",
            existingProductId: "product-2",
            lineNumber: 2,
            quantity: 1,
          },
        ],
        checkedBy: "Design checker",
        designBomCompleted: "Yes",
        designerName: "Design owner",
        fixtureApproxCost: 0,
        fixtureRequired: "No",
        gaugesRequired: "No",
        inspectionApproxCost: 0,
        internalPartCategory: "Valve",
        internalPartSize: "10mm",
        internalPartSubCategory: "Stem",
        itemType: "Package",
        manufacturingProcess: "Conventional",
        targetCompletionDate: "2026-08-29",
        toolingApproxCost: 0,
        toolingRequired: "No",
      })
    ).toEqual([
      "BOM Line 1 Product Size",
      "BOM Line 1 Component Category",
      "BOM Line 1 Component Subcategory",
    ])
  })
})
