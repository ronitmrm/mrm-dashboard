import { describe, expect, test } from "vitest"

import { plannerPendingMachineIssueRows } from "./planner-pending-review"

describe("plannerPendingMachineIssueRows", () => {
  test("keeps only useful business details from a raw machine issue", () => {
    expect(plannerPendingMachineIssueRows([
      {
        _id: "technical-id",
        organizationId: "organization-id",
        machineNo: "ADB503",
        unavailableFrom: "2026-07-02",
        unavailableTo: "2026-07-06",
        status: "Active",
        rescheduleAction: "shift_required",
        planningMode: "system_recalculate",
        interruptedSetups: [
          { jcNo: "JC-101", setupNo: "1" },
          { jcNo: "JC-102", setupNo: "2" },
        ],
        queuePlacements: [{ targetMachine: "ADB504" }],
        reason: "Breakdown",
        sourcePayload: { internal: "must not be displayed" },
        createdAt: "2026-07-01T10:16:31.528Z",
      },
    ])).toEqual([
      {
        Machine: "ADB503",
        From: "2026-07-02",
        To: "2026-07-06",
        Status: "Active",
        "Plan Action": "Shift required",
        "Planning Method": "System recalculation",
        "Affected Work": "2 interrupted setups · 1 queue placement",
        Reason: "Breakdown",
        "Logged On": "2026-07-01T10:16:31.528Z",
      },
    ])
  })
})
