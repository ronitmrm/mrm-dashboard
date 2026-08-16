import { describe, expect, it } from "vitest"

import { jobCardActionAssignments } from "./job-card-action-planning"

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
