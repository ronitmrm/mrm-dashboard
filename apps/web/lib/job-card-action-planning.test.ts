import { describe, expect, it } from "vitest"

import {
  dispatchReadyJobCards,
  jobCardActionAssignments,
} from "./job-card-action-planning"

describe("jobCardActionAssignments", () => {
  it("maps each machine to its current planned Job Card and setup", () => {
    expect(jobCardActionAssignments([
      {
        jcNo: "JC-002",
        machine: "C501",
        plannedProductionStartDate: "18-August-26",
        runningStatus: "Planned",
        setupNo: "2",
      },
      {
        jcNo: "JC-001",
        machine: "C501",
        plannedProductionStartDate: "16-August-26",
        rawActualQty: 8_441,
        runningStatus: "Running",
        setupNo: "1",
      },
      {
        jcNo: "JC-003",
        machine: "C502",
        plannedProductionStartDate: "17-August-26",
        runningStatus: "Setup complete",
        setupNo: "3",
      },
    ])).toEqual([
      { jobCard: "JC-001", machine: "C501", setupNo: "1" },
      { jobCard: "JC-003", machine: "C502", setupNo: "3" },
    ])
  })
})

describe("dispatchReadyJobCards", () => {
  it("returns only undispatched Job Cards whose every planned setup is complete", () => {
    expect(
      dispatchReadyJobCards(
        [
          { dispatchStatus: "In production", jcNo: "JC-READY" },
          { dispatchStatus: "In production", jcNo: "JC-PARTIAL" },
          { dispatchStatus: "Shifted to dispatch", jcNo: "JC-DISPATCHED" },
          { dispatchStatus: "In production", jcNo: "JC-NO-PLAN" },
        ],
        [
          { jcNo: "JC-READY", runningStatus: "Complete", setupNo: "1" },
          { jcNo: "JC-READY", setupNo: "2", shopFloorStage: "item_complete" },
          { jcNo: "JC-PARTIAL", runningStatus: "Complete", setupNo: "1" },
          { jcNo: "JC-PARTIAL", runningStatus: "Running", setupNo: "2" },
          { jcNo: "JC-DISPATCHED", runningStatus: "Complete", setupNo: "1" },
        ],
      ),
    ).toEqual(["JC-READY"])
  })
})
