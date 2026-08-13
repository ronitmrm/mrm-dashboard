import { describe, expect, it } from "vitest";

import {
  isActivePlannerDecision,
  validConfirmedPrioritySetupNumbers,
  workOrderIdentityMatches,
  machineCodeMatches,
  machineFamilyKey,
  normalizeRescheduleAction,
  priorityScore,
  rescheduleActionLabel,
  isPlanningWorkday,
  sourcePlannerDecisions,
} from "@workspace/db/planning-rules";

describe("machineFamilyKey", () => {
  it("maps route machine family codes and concrete machine numbers to the same family", () => {
    expect(machineFamilyKey("C5")).toBe("c5");
    expect(machineFamilyKey("C501")).toBe("c5");
    expect(machineFamilyKey("C502")).toBe("c5");
  });

  it("supports multi-letter machine families", () => {
    expect(machineFamilyKey("TH5")).toBe("th5");
    expect(machineFamilyKey("TH501")).toBe("th5");
  });

  it("matches route families to concrete machine numbers", () => {
    expect(machineCodeMatches("ADB5", "ADB501")).toBe(true);
    expect(machineCodeMatches("ADB5", "ADB601")).toBe(false);
  });
});

describe("planner source rules", () => {
  it("accepts only a complete ordered priority setup confirmation sequence", () => {
    expect(validConfirmedPrioritySetupNumbers(["1", "2", "3"])).toEqual(["1", "2", "3"]);
    expect(validConfirmedPrioritySetupNumbers([])).toBeNull();
    expect(validConfirmedPrioritySetupNumbers(["2", "1"])).toBeNull();
    expect(validConfirmedPrioritySetupNumbers(["1", "1"])).toBeNull();
  });

  it("does not allow a Job Card to be reassigned to another Work Order Line", () => {
    expect(
      workOrderIdentityMatches(
        { itemId: "ITEM-1", workOrderNumber: "FG-1::PART-1" },
        { itemId: "item-1", workOrderNumber: "fg-1::part-1" }
      )
    ).toBe(true);
    expect(
      workOrderIdentityMatches(
        { itemId: "ITEM-1", workOrderNumber: "FG-1::PART-1" },
        { itemId: "ITEM-2", workOrderNumber: "FG-1::PART-2" }
      )
    ).toBe(false);
  });

  it("uses Friday as the weekly plant shutdown day", () => {
    expect(isPlanningWorkday(new Date("2026-06-26T00:00:00.000Z"))).toBe(false);
    expect(isPlanningWorkday(new Date("2026-06-28T00:00:00.000Z"))).toBe(true);
  });

  it("starts without old workbook planner decisions", () => {
    expect(sourcePlannerDecisions.machineConstraints).toEqual([]);
    expect(sourcePlannerDecisions.planOverrides).toEqual([]);
  });

  it("normalizes legacy planner action rules", () => {
    expect(isActivePlannerDecision("Closed")).toBe(false);
    expect(isActivePlannerDecision("Active")).toBe(true);
    expect(normalizeRescheduleAction("shift all")).toBe("shift_all");
    expect(rescheduleActionLabel("delay")).toBe("Delay plan");
    expect(priorityScore("urgent")).toBe(100);
    expect(priorityScore("low")).toBe(25);
  });
});
