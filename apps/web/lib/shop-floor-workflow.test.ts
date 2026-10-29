import { describe, expect, it } from "vitest";

import {
  nextShopFloorStageId,
  openProductionSessionForShopFloorItem,
  productionSessionDetailHref,
  shopFloorNoPendingActionLabel,
  shopFloorRowIsExplicitlyStopped,
  shopFloorRowIsProductionCurrent,
  shopFloorRowIsProducedHistory,
  shopFloorStageIdsForMachine,
} from "./shop-floor-workflow";

describe("shop-floor workflow action labels", () => {
  it("excludes moved setup production history while retaining remaining machine work", () => {
    const history = { machine: "CNC-12", machineUnavailableSplitRole: "produced_on_unavailable_machine", pendingGoodQty: 0, rawActualQty: 179 }
    const remaining = { machine: "CNC-13", machineUnavailableSplitRole: "remaining_moved_to_alternate_machine", pendingGoodQty: 1321 }
    const rows = [history, remaining]
    expect(rows.filter((row) => !shopFloorRowIsProducedHistory(row))).toEqual([remaining])
    expect(rows).toEqual([history, remaining])
  })
  it("keeps reopened production out of Running until the machine starts again", () => {
    const reopened = { shopFloorStage: "planned", runningStatus: "Planned", rawRows: 18, rawOutputQty: 7336, rawActualQty: 7336 }
    expect(shopFloorRowIsProductionCurrent(reopened)).toBe(false)
    expect(shopFloorRowIsProductionCurrent({ ...reopened, shopFloorStage: "raw_material_at_machine" })).toBe(false)
    expect(shopFloorRowIsProductionCurrent({ ...reopened, shopFloorStage: "operator_started" })).toBe(true)
    expect(shopFloorRowIsProductionCurrent({ ...reopened, shopFloorStage: "" })).toBe(true)
  })
  it("uses the shared workflow, including existing Pre Setting records", () => {
    expect(nextShopFloorStageId("raw_material_at_machine")).toBe("setting")
    expect(nextShopFloorStageId("presetting")).toBe("setting")
    expect(nextShopFloorStageId("tools_drawing")).toBe("setting")
    expect(nextShopFloorStageId("setting")).toBe("quality_approval")
  })
  it("starts blasting machines after material placement without Setting or Quality Approval", () => {
    const machineType = "Blasting Machine"
    expect(shopFloorStageIdsForMachine(machineType)).toEqual([
      "raw_material_at_machine", "operator_started",
    ])
    expect(nextShopFloorStageId("planned", machineType)).toBe("raw_material_at_machine")
    expect(nextShopFloorStageId("raw_material_at_machine", machineType)).toBe("operator_started")
    expect(nextShopFloorStageId("setting", machineType)).toBe("operator_started")
    expect(nextShopFloorStageId("operator_started", machineType)).toBeUndefined()
    expect(nextShopFloorStageId("item_complete", machineType)).toBeUndefined()
  })
  it("does not label an already-started machine row as ready to start", () => {
    expect(shopFloorNoPendingActionLabel("operator_started")).toBe("Machine already started");
    expect(shopFloorNoPendingActionLabel("worker_start")).toBe("Machine already started");
  });

  it("keeps a planner-stopped opening row off the current machine slot", () => {
    expect(shopFloorRowIsExplicitlyStopped({
      rawOutputQty: 6082,
      runningStatus: "Planner stopped",
      shopFloorStage: "planned",
    })).toBe(true)
  })

  it("links a running item to its exact open production session", () => {
    const item = {
      machine: "CNC-12",
      jcNo: "P1462",
      partCode: "M448",
      optionNumber: "1",
      setupNo: "1",
    }
    const session = {
      id: "session-12",
      status: "open",
      machineNumber: "CNC-12",
      jobCardNumber: "P1462",
      partCode: "M448",
      optionNumber: "1",
      setupNumber: "1",
    }

    expect(openProductionSessionForShopFloorItem([session], item)).toBe(session)
    expect(productionSessionDetailHref("cnc", "session-12")).toBe(
      "/dashboard/production-sessions?floor=cnc&session=session-12"
    )
  })
});
