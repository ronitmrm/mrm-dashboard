import { describe, expect, it } from "vitest";

import {
  applyShopFloorStatusPatches,
  shopFloorStatusPatchFromAction,
  upsertShopFloorStatusPatch,
} from "./shop-floor-optimistic";

describe("shop-floor optimistic status patches", () => {
  it("removes an RM-at-machine task from the shop-floor queue without refreshing the snapshot", () => {
    const payload = {
      productionControl: {
        machinePlanDetailRows: [
          {
            jcNo: "JC-1",
            partCode: "ITEM-1",
            optionNumber: "A",
            setupNo: "1",
            machine: "C501",
            shopFloorStage: "",
            shopFloorStageLabel: "",
            runningStatus: "Planned",
          },
        ],
      },
    };
    const patch = shopFloorStatusPatchFromAction("data-entry", {
      entryType: "shop_floor_status",
      payload: {
        jcNo: "JC-1",
        partCode: "ITEM-1",
        optionNumber: "A",
        setupNo: "1",
        machine: "C501",
        stage: "raw_material_at_machine",
        stageLabel: "Raw material at the machine",
        doneBy: "SF1",
        completedAt: "2026-06-27T10:00:00.000Z",
      },
    });

    expect(patch).toBeDefined();
    const patched = applyShopFloorStatusPatches(payload, upsertShopFloorStatusPatch([], patch!));
    const productionControl = patched.productionControl as { machinePlanDetailRows: Record<string, unknown>[] };
    const row = productionControl.machinePlanDetailRows[0]!;

    expect(row.shopFloorStage).toBe("raw_material_at_machine");
    expect(row.shopFloorStageLabel).toBe("Raw material at the machine");
    expect(row.shopFloorDoneBy).toBe("SF1");
    expect(row.shopFloorUpdatedAt).toBe("2026-06-27T10:00:00.000Z");
    expect(row.runningStatus).toBe("Planned");
  });

  it("reflects a started machine in shop-floor rows, machine detail rows, and job-card tiles", () => {
    const payload = {
      productionControl: {
        jobCardStatusTiles: [
          {
            jcNo: "JC-2",
            partCode: "ITEM-2",
            optionNumber: "B",
            rmStatus: "Received",
            runningStatus: "Planned",
            rawRows: 0,
          },
        ],
        machinePlanDetailRows: [
          {
            jcNo: "JC-2",
            partCode: "ITEM-2",
            optionNumber: "B",
            setupNo: "2",
            machine: "C502",
            shopFloorStage: "quality_approval",
            shopFloorStageLabel: "Quality approval",
            runningStatus: "Setup complete",
            actualProductionStartDate: "-",
          },
        ],
      },
    };
    const patch = shopFloorStatusPatchFromAction("data-entry", {
      entryType: "shop_floor_status",
      payload: {
        jcNo: "JC-2",
        partCode: "ITEM-2",
        optionNumber: "B",
        setupNo: "2",
        machine: "C502",
        stage: "operator_started",
        stageLabel: "Operator assigned and machine started",
        doneBy: "M1",
        worker: "OP1",
        completedAt: "2026-06-27T11:00:00.000Z",
      },
    });

    const patched = applyShopFloorStatusPatches(payload, upsertShopFloorStatusPatch([], patch!));
    const productionControl = patched.productionControl as {
      jobCardStatusTiles: Record<string, unknown>[];
      machinePlanDetailRows: Record<string, unknown>[];
    };
    const machineRow = productionControl.machinePlanDetailRows[0]!;
    const jobCard = productionControl.jobCardStatusTiles[0]!;

    expect(machineRow.shopFloorStage).toBe("operator_started");
    expect(machineRow.shopFloorStageLabel).toBe("Operator assigned and machine started");
    expect(machineRow.shopFloorWorker).toBe("OP1");
    expect(machineRow.runningStatus).toBe("Running");
    expect(jobCard.runningStatus).toBe("Running");
    expect(jobCard.shopFloorStage).toBe("operator_started");
  });
});
