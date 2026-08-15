import { describe, expect, it } from "vitest";

import { normalizeUserEnteredPayload, properCaseUserText, preservesUserEnteredTextCase } from "@workspace/db/user-entry-text";

describe("user entry text normalization", () => {
  it("converts mixed and uppercase human text to proper case", () => {
    expect(properCaseUserText("  mACHINE   mASTER loCATION ")).toBe("Machine Master Location");
    expect(properCaseUserText("PRE-SETTING / FINAL CHECK")).toBe("Pre-Setting / Final Check");
    expect(properCaseUserText("O'NEIL TOOL ROOM")).toBe("O'Neil Tool Room");
    expect(properCaseUserText("DON'T CHANGE OPERATOR'S CODE")).toBe("Don't Change Operator's Code");
  });

  it("normalizes human text recursively without changing other value types", () => {
    expect(normalizeUserEnteredPayload({
      machineName: "MAIN TURNING MACHINE",
      machineFamily: "CNC TURNING",
      location: "NORTH SHOP FLOOR",
      remarks: "CHECK OIL PRESSURE",
      active: true,
      steps: [{ checkPoint: "VERIFY SAFETY GUARD", sequence: 1 }],
    })).toEqual({
      machineName: "Main Turning Machine",
      machineFamily: "Cnc Turning",
      location: "North Shop Floor",
      remarks: "Check Oil Pressure",
      active: true,
      steps: [{ checkPoint: "Verify Safety Guard", sequence: 1 }],
    });
  });

  it("preserves codes, identifiers, workflow tokens, technical values, emails, and dates", () => {
    const input = {
      entryType: "machine_master",
      returnTab: "masterTablesTab",
      cardRole: "shopFloor",
      machineNo: "CNC-01",
      targetMachine: "CNC-02-A",
      itemCode: "ABc-100-X",
      jobCard: "JC-0098",
      empId: "EMP-A7",
      email: "USER.Name@EXAMPLE.COM",
      stage: "operator_started",
      measurementMethod: "weight",
      endReason: "shift_change",
      enteredRole: "shop_floor",
      specification: "M10 x 1.5 / H7",
      savedAt: "2026-08-10T10:13:24.070Z",
      operatorName: "RAHUL SHARMA",
    };

    expect(normalizeUserEnteredPayload(input)).toEqual({
      ...input,
      operatorName: "Rahul Sharma",
    });
    expect(preservesUserEnteredTextCase("checklistCode")).toBe(true);
    expect(preservesUserEnteredTextCase("machineName")).toBe(false);
  });
});
