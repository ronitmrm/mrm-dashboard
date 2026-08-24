import { describe, expect, it } from "vitest"

import {
  hasProductionFloorTaskCapability,
  productionFloorTaskCapability,
  productionFloorTaskForMutation,
} from "./production-floor-task-capabilities"

describe("production floor task capabilities", () => {
  it("keeps the same planner action independent for every production floor", () => {
    expect(
      productionFloorTaskCapability("conventional", "planner_priority")
    ).toBe(
      "operations.floors.conventional.planner_actions.planner_priority.write"
    )
    expect(productionFloorTaskCapability("cnc", "planner_priority")).toBe(
      "operations.floors.cnc.planner_actions.planner_priority.write"
    )
  })

  it("resolves direct dashboard actions to the exact floor task", () => {
    expect(
      productionFloorTaskForMutation("planner-priority", {
        productionFloorCode: "conventional",
      })
    ).toMatchObject({
      capability:
        "operations.floors.conventional.planner_actions.planner_priority.write",
      legacyCapability: "planning.priority.write",
    })
    expect(
      productionFloorTaskForMutation("planner-priority", {
        productionFloorCode: "cnc",
      })
    ).toMatchObject({
      capability:
        "operations.floors.cnc.planner_actions.planner_priority.write",
    })
  })

  it("denies the same action on a different floor", () => {
    const granted = new Set([
      productionFloorTaskCapability("conventional", "planner_priority"),
    ])

    expect(
      hasProductionFloorTaskCapability(granted, "planner-priority", {
        productionFloorCode: "conventional",
      })
    ).toBe(true)
    expect(
      hasProductionFloorTaskCapability(granted, "planner-priority", {
        productionFloorCode: "cnc",
      })
    ).toBe(false)
  })

  it("routes role workflow entries to their actual production submodule", () => {
    expect(
      productionFloorTaskForMutation("data-entry", {
        entryType: "shop_floor_status",
        productionFloorCode: "forging",
        payload: { stage: "quality_approval" },
      })
    ).toMatchObject({
      capability:
        "operations.floors.forging.quality_control_tasks.quality_approval.write",
    })
    expect(
      productionFloorTaskForMutation("data-entry", {
        entryType: "setup_checklist_session",
        productionFloorCode: "forging",
      })
    ).toMatchObject({
      capability:
        "operations.floors.forging.machinist_tasks.setup_checklist.write",
    })
  })

  it("does not add PPAC floor gates to company-wide entry workflows", () => {
    expect(
      productionFloorTaskForMutation("data-entry", {
        entryType: "attendance",
        productionFloorCode: "conventional",
      })
    ).toBeNull()
  })
})
