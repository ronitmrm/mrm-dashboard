import { describe, expect, it } from "vitest";

import {
  activeCorrectionTargetKeys,
  dataEntryCorrectionTargetsWithWorkflowCascade,
  latestUncorrectedRow,
} from "./dashboard-corrections";

describe("dashboard corrections", () => {
  it("marks only active correction actions as target blockers", () => {
    expect(activeCorrectionTargetKeys([
      { targetTable: "dataEntries", targetId: "a", action: "reverse" },
      { targetTable: "dataEntries", targetId: "b", action: "replace" },
      { targetTable: "routeChanges", targetId: "c", action: "close" },
      { targetTable: "dataEntries", targetId: "d", action: "note" },
    ])).toEqual(new Set(["dataEntries:a", "dataEntries:b", "routeChanges:c"]));
  });

  it("selects the latest data-entry row that was not corrected", () => {
    const correctionTargets = new Set(["dataEntries:newer"]);
    expect(latestUncorrectedRow([
      { _id: "older", createdAt: "2026-06-26T00:00:00.000Z" },
      { _id: "newer", createdAt: "2026-06-27T00:00:00.000Z" },
    ], "dataEntries", correctionTargets)).toEqual({
      _id: "older",
      createdAt: "2026-06-26T00:00:00.000Z",
    });
  });

  it("cascades reversed shop-floor tasks to downstream tasks on the same setup", () => {
    const rows = [
      shopFloorRow("rm", "raw_material_at_machine"),
      shopFloorRow("presetting", "presetting"),
      shopFloorRow("setting", "setting"),
      firstPieceRow("fpi"),
      shopFloorRow("quality", "quality_approval"),
      shopFloorRow("operator", "operator_started"),
      shopFloorRow("other-operator", "operator_started", { jcNo: "JC-999", partCode: "M999" }),
    ];

    expect(dataEntryCorrectionTargetsWithWorkflowCascade(
      rows,
      new Set(["dataEntries:presetting"]),
    )).toEqual(new Set([
      "dataEntries:presetting",
      "dataEntries:setting",
      "dataEntries:fpi",
      "dataEntries:quality",
      "dataEntries:operator",
    ]));
  });

  it("does not cascade an old correction to tasks completed after the correction", () => {
    const rows = [
      shopFloorRow("rm", "raw_material_at_machine", {}, "2026-06-30T08:00:00.000Z"),
      shopFloorRow("old-presetting", "presetting", {}, "2026-06-30T08:05:00.000Z"),
      shopFloorRow("new-setting", "setting", {}, "2026-06-30T08:20:00.000Z"),
    ];
    const corrections = [
      {
        targetTable: "dataEntries",
        targetId: "rm",
        action: "reverse",
        createdAt: "2026-06-30T08:10:00.000Z",
      },
    ];

    expect(dataEntryCorrectionTargetsWithWorkflowCascade(
      rows,
      activeCorrectionTargetKeys(corrections),
      corrections,
    )).toEqual(new Set([
      "dataEntries:rm",
      "dataEntries:old-presetting",
    ]));
  });
});

function shopFloorRow(
  _id: string,
  stage: string,
  overrides: Partial<WorkflowPayload> = {},
  createdAt?: string,
) {
  const payload = workflowPayload({ ...overrides, stage });
  return {
    _id,
    entryType: "shop_floor_status",
    key: setupKey(payload),
    payload,
    createdAt,
  };
}

function firstPieceRow(_id: string, overrides: Partial<WorkflowPayload> = {}, createdAt?: string) {
  const payload = workflowPayload(overrides);
  return {
    _id,
    entryType: "first_piece_inspection_report",
    key: `${setupKey(payload)}|fpi`,
    payload,
    createdAt,
  };
}

type WorkflowPayload = {
  jcNo: string;
  partCode: string;
  optionNumber: string;
  setupNo: string;
  machine: string;
  stage?: string;
};

function workflowPayload(overrides: Partial<WorkflowPayload> = {}): WorkflowPayload {
  return {
    jcNo: "JC-001",
    partCode: "M1",
    optionNumber: "1",
    setupNo: "1",
    machine: "C501",
    ...overrides,
  };
}

function setupKey(payload: WorkflowPayload) {
  return [
    payload.jcNo,
    payload.partCode,
    payload.optionNumber,
    payload.setupNo,
    payload.machine,
  ].map((value) => value.toLowerCase()).join("|");
}
