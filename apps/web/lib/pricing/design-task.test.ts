import { describe, expect, test } from "vitest"

import {
  designPortfolioDecisions,
  designStatuses,
  designTaskStatusAfterStart,
  designTaskIsEditable,
  designTaskIsOpen,
  deriveDesignTaskState,
} from "@workspace/db/commercial-design-domain"

describe("Pricing Design Task contract", () => {
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
})
