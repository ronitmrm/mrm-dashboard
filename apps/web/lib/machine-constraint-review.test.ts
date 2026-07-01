import { describe, expect, it } from "vitest";

import { machineConstraintQueueReview } from "./machine-constraint-review";

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
        { machineNo: "A510", machineType: "AUTO", status: "Active" },
        { machineNo: "A511", machineType: "AUTO", status: "Active" },
        { machineNo: "S710", machineType: "SECONDARY", status: "Active" },
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
      machineRows: [{ machineNo: "A511", machineType: "AUTO", status: "Active" }],
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
        { machineNo: "A511", machineType: "AUTO", status: "Active" },
        { machineNo: "A512", machineType: "AUTO", status: "Active" },
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
      machineRows: [{ machineNo: "A511", machineType: "AUTO", status: "Active" }],
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
});
