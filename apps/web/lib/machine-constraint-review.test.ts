import { describe, expect, it } from "vitest";

import {
  machineConstraintAffectedRows,
  machineConstraintQueueReview,
} from "./machine-constraint-review";

describe("machineConstraintAffectedRows", () => {
  it("selects the full machine plan when the planner chooses Shift All", () => {
    const affected = machineConstraintAffectedRows(
      [
        {
          jcNo: "P1412",
          machine: "CNC-11",
          plannedProductionStartDate: "22-Sept-26",
          plannedProductionEndDate: "22-Sept-26",
        },
        {
          jcNo: "P1469",
          machine: "CNC-11",
          plannedProductionStartDate: "26-Sept-26",
          plannedProductionEndDate: "28-Sept-26",
        },
        {
          jcNo: "P9999",
          machine: "CNC-12",
          plannedProductionStartDate: "21-Sept-26",
          plannedProductionEndDate: "21-Sept-26",
        },
      ],
      {
        machineNo: "CNC-11",
        rescheduleAction: "shift_all",
        unavailableFrom: "2026-09-21",
        unavailableTo: "",
      }
    );

    expect(affected.map((row) => row.jcNo)).toEqual(["P1412", "P1469"]);
  });
});

describe("machineConstraintQueueReview", () => {
  it("shows destination and downstream queues before saving a machine breakdown", () => {
    const affected = {
      jcNo: "JC-014",
      partCode: "M24",
      optionNumber: "1",
      setupNo: "1",
      routeMachine: "A5",
      machine: "A510",
      machineType: "AUTO",
      plannedProductionStartDate: "1-July-26",
      plannedProductionEndDate: "8-July-26",
    };
    const review = machineConstraintQueueReview({
      machineNo: "A510",
      rescheduleAction: "shift_required",
      affectedRows: [affected],
      machineRows: [
        { machineNo: "A510", machineFamily: "A5", machineType: "AUTO", status: "Active" },
        { machineNo: "A511", machineFamily: "A5", machineType: "AUTO", status: "Active" },
        { machineNo: "S710", machineFamily: "S7", machineType: "SECONDARY", status: "Active" },
      ],
      plannedRows: [
        affected,
        {
          jcNo: "JC-999",
          partCode: "M99",
          optionNumber: "1",
          setupNo: "1",
          routeMachine: "A5",
          machine: "A511",
          machineType: "AUTO",
          plannedProductionStartDate: "9-July-26",
          plannedProductionEndDate: "12-July-26",
        },
        {
          jcNo: "JC-014",
          partCode: "M24",
          optionNumber: "1",
          setupNo: "2",
          routeMachine: "S7",
          machine: "S710",
          machineType: "SECONDARY",
          plannedProductionStartDate: "13-July-26",
          plannedProductionEndDate: "16-July-26",
        },
      ],
    });

    expect(review.map((group) => ({ kind: group.kind, machine: group.machine }))).toEqual([
      { kind: "destination", machine: "A511" },
      { kind: "downstream", machine: "S710" },
    ]);
    expect(review[0]?.rows).toHaveLength(1);
    expect(review[0]?.rows[0]).toMatchObject({ jcNo: "JC-999", machine: "A511" });
    expect(review[1]?.rows[0]).toMatchObject({ jcNo: "JC-014", setupNo: "2", machine: "S710" });
  });

  it("does not show destination queues when the planner chooses to delay on the same machine", () => {
    const review = machineConstraintQueueReview({
      machineNo: "A510",
      rescheduleAction: "delay",
      affectedRows: [{ jcNo: "JC-014", setupNo: "1", routeMachine: "A5", machine: "A510", machineType: "AUTO", plannedProductionStartDate: "1-July-26" }],
      machineRows: [{ machineNo: "A511", machineFamily: "A5", machineType: "AUTO", status: "Active" }],
      plannedRows: [{ jcNo: "JC-999", setupNo: "1", routeMachine: "A5", machine: "A511", machineType: "AUTO", plannedProductionStartDate: "9-July-26" }],
    });

    expect(review.some((group) => group.kind === "destination")).toBe(false);
  });

  it("limits queue review to the selected target machine for a part switch", () => {
    const affected = {
      jcNo: "JC-014",
      partCode: "M24",
      optionNumber: "1",
      setupNo: "1",
      routeMachine: "A5",
      machine: "A510",
      machineType: "AUTO",
      plannedProductionStartDate: "1-July-26",
    };
    const review = machineConstraintQueueReview({
      machineNo: "A510",
      rescheduleAction: "shift_required",
      affectedRows: [affected],
      explicitDestinationMachines: ["A511"],
      includeSameMachineLater: false,
      includeDownstream: false,
      machineRows: [
        { machineNo: "A511", machineFamily: "A5", machineType: "AUTO", status: "Active" },
        { machineNo: "A512", machineFamily: "A5", machineType: "AUTO", status: "Active" },
      ],
      plannedRows: [
        affected,
        {
          jcNo: "JC-998",
          partCode: "M98",
          optionNumber: "1",
          setupNo: "1",
          routeMachine: "A5",
          machine: "A511",
          machineType: "AUTO",
          plannedProductionStartDate: "9-July-26",
        },
        {
          jcNo: "JC-999",
          partCode: "M99",
          optionNumber: "1",
          setupNo: "1",
          routeMachine: "A5",
          machine: "A512",
          machineType: "AUTO",
          plannedProductionStartDate: "10-July-26",
        },
        {
          jcNo: "JC-014",
          partCode: "M24",
          optionNumber: "1",
          setupNo: "2",
          routeMachine: "S7",
          machine: "S710",
          machineType: "SECONDARY",
          plannedProductionStartDate: "13-July-26",
        },
      ],
    });

    expect(review.filter((group) => group.kind === "destination").map((group) => group.machine)).toEqual(["A511"]);
    expect(review.some((group) => group.machine === "A512")).toBe(false);
    expect(review.some((group) => group.kind === "downstream")).toBe(false);
  });

  it("hides the source-machine later queue when reviewing a part switch", () => {
    const affected = {
      jcNo: "JC-014",
      partCode: "M24",
      optionNumber: "1",
      setupNo: "1",
      routeMachine: "A5",
      machine: "A510",
      machineType: "AUTO",
      plannedProductionStartDate: "1-July-26",
    };
    const review = machineConstraintQueueReview({
      machineNo: "A510",
      rescheduleAction: "shift_required",
      affectedRows: [affected],
      explicitDestinationMachines: ["A511"],
      includeSameMachineLater: false,
      includeDownstream: false,
      machineRows: [{ machineNo: "A511", machineFamily: "A5", machineType: "AUTO", status: "Active" }],
      plannedRows: [
        affected,
        {
          jcNo: "JC-888",
          partCode: "M88",
          optionNumber: "1",
          setupNo: "1",
          routeMachine: "A5",
          machine: "A510",
          machineType: "AUTO",
          plannedProductionStartDate: "9-July-26",
        },
      ],
    });

    expect(review.some((group) => group.kind === "same_machine_later")).toBe(false);
    expect(review.map((group) => ({ kind: group.kind, machine: group.machine }))).toEqual([
      { kind: "destination", machine: "A511" },
    ]);
  });

  it("does not show unrelated same-type machines as shift destinations", () => {
    const affected = {
      jcNo: "JC-090",
      partCode: "M127",
      optionNumber: "1",
      setupNo: "1",
      routeMachine: "DT5",
      machine: "DT501",
      machineType: "MANUAL",
      plannedProductionStartDate: "1-July-26",
    };
    const review = machineConstraintQueueReview({
      machineNo: "DT501",
      rescheduleAction: "shift_required",
      affectedRows: [affected],
      includeSameMachineLater: false,
      includeDownstream: false,
      machineRows: [
        { machineNo: "DT502", machineFamily: "DT5", machineType: "MANUAL", status: "Active" },
        { machineNo: "SAD903", machineFamily: "SAD9", machineType: "MANUAL", status: "Active" },
        { machineNo: "SA705", machineFamily: "SA7", machineType: "MANUAL", status: "Active" },
      ],
      plannedRows: [
        affected,
        {
          jcNo: "JC-888",
          partCode: "M88",
          optionNumber: "1",
          setupNo: "1",
          routeMachine: "SAD9",
          machine: "SAD903",
          machineType: "MANUAL",
          plannedProductionStartDate: "9-July-26",
        },
        {
          jcNo: "JC-777",
          partCode: "M77",
          optionNumber: "1",
          setupNo: "1",
          routeMachine: "DT5",
          machine: "DT502",
          machineType: "MANUAL",
          plannedProductionStartDate: "10-July-26",
        },
      ],
    });

    expect(review.map((group) => ({ kind: group.kind, machine: group.machine }))).toEqual([
      { kind: "destination", machine: "DT502" },
    ]);
  });
});
