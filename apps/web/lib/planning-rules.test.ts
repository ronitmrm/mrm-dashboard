import { describe, expect, it } from "vitest";

import {
  isActivePlannerDecision,
  machineCodeMatches,
  machineFamilyKey,
  normalizeRescheduleAction,
  priorityScore,
  rescheduleActionLabel,
  sourcePlannerDecisions,
} from "./planning-rules";

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
