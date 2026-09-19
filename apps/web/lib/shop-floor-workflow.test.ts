import { describe, expect, it } from "vitest";

import {
  nextShopFloorStageId,
  setupChecklistItemAppliesToPhase,
  shopFloorNoPendingActionLabel,
  shopFloorRowIsExplicitlyStopped,
} from "./shop-floor-workflow";

describe("shop-floor workflow action labels", () => {
  it("skips Pre Setting only for CNC, including existing Pre Setting records", () => {
    expect(nextShopFloorStageId("raw_material_at_machine", "cnc")).toBe("setting")
    expect(nextShopFloorStageId("presetting", "cnc")).toBe("setting")
    expect(nextShopFloorStageId("raw_material_at_machine", "conventional")).toBe("presetting")
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

  it("shows each setup checklist point only in its assigned phase", () => {
    expect(setupChecklistItemAppliesToPhase("Pre setting", "start")).toBe(true);
    expect(setupChecklistItemAppliesToPhase("Pre setting", "end")).toBe(false);
    expect(setupChecklistItemAppliesToPhase("Setting", "start")).toBe(false);
    expect(setupChecklistItemAppliesToPhase("Setting", "end")).toBe(true);
  });
});
