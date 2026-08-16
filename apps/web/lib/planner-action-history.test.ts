import { describe, expect, test } from "vitest"

import { plannerActionHistoryRows } from "./planner-action-history"

describe("plannerActionHistoryRows", () => {
  test("keeps each mixed decision's business fields and hides internal IDs", () => {
    const rows = plannerActionHistoryRows([
      {
        actionType: "Machine Unavailable",
        actorUserId: "actor-internal-id",
        createdAt: "2026-08-16T10:34:33.874Z",
        interruptedSetups: [
          {
            jobCardNumber: "JC-001",
            machineNumber: "ADD501",
            setupNumber: 1,
          },
        ],
        machineNumber: "ADD501",
        organizationId: "organization-internal-id",
        queuePlacements: [
          {
            targetJobCardNumber: "JC-001",
            targetMachineNumber: "ADD502",
            targetPartCode: "M2B",
            targetSetupNumber: 1,
          },
        ],
        reason: "Breakdown",
        remark: "Reviewed affected setup and queue placement",
        unavailableFrom: "2026-08-16",
        unavailableTo: "2026-09-16",
      },
      {
        actionType: "Priority",
        actorUserId: "actor-internal-id",
        confirmedSetupNumbers: ["1", "2", "3", "4"],
        createdAt: "2026-08-16T10:29:55.496Z",
        jobCardNumber: "JC-001",
        organizationId: "organization-internal-id",
        partCode: "M2B",
        priority: "High",
      },
    ])

    expect(rows).toEqual([
      {
        Action: "Machine Unavailable",
        Date: "2026-08-16T10:34:33.874Z",
        "Job Card": "JC-001",
        "Part Code": "M2B",
        Setups: "1",
        "Machine / Route": "ADD501 → ADD502",
        Decision: "Unavailable 2026-08-16 to 2026-09-16",
        Reason: "Breakdown",
        Notes: "Reviewed affected setup and queue placement",
      },
      {
        Action: "Priority Change",
        Date: "2026-08-16T10:29:55.496Z",
        "Job Card": "JC-001",
        "Part Code": "M2B",
        Setups: "1, 2, 3, 4",
        "Machine / Route": "—",
        Decision: "High priority",
        Reason: "—",
        Notes: "—",
      },
    ])
    expect(Object.keys(rows[0]!)).toEqual([
      "Action",
      "Date",
      "Job Card",
      "Part Code",
      "Setups",
      "Machine / Route",
      "Decision",
      "Reason",
      "Notes",
    ])
  })

  test("shows the source and destination for a moved setup", () => {
    expect(
      plannerActionHistoryRows([
        {
          actionType: "Machine Switch",
          createdAt: "2026-08-16T11:00:00.000Z",
          fromMachineNumber: "ADD501",
          jobCardNumber: "JC-002",
          queuePlacements: [{ targetPartCode: "M3C" }],
          reason: "Balance load",
          setupNumber: 2,
          toMachineNumber: "ADD502",
        },
      ])
    ).toEqual([
      {
        Action: "Move Setup",
        Date: "2026-08-16T11:00:00.000Z",
        "Job Card": "JC-002",
        "Part Code": "M3C",
        Setups: "2",
        "Machine / Route": "ADD501 → ADD502",
        Decision: "Setup moved",
        Reason: "Balance load",
        Notes: "—",
      },
    ])
  })

  test("shows the selected route and remaining-setup decisions", () => {
    expect(
      plannerActionHistoryRows([
        {
          actionType: "Route Change",
          createdAt: "2026-08-16T11:30:00.000Z",
          jobCardNumber: "JC-003",
          newRouteCode: "B",
          reason: "Alternative tooling available",
          remainingSetups: [
            { plan: true, setupNumber: 3 },
            { plan: false, setupNumber: 4 },
          ],
        },
      ])
    ).toEqual([
      {
        Action: "Route Change",
        Date: "2026-08-16T11:30:00.000Z",
        "Job Card": "JC-003",
        "Part Code": "—",
        Setups: "3, 4",
        "Machine / Route": "Route B",
        Decision: "Plan 3; Skip 4",
        Reason: "Alternative tooling available",
        Notes: "—",
      },
    ])
  })

  test("keeps legacy planner field aliases readable", () => {
    expect(
      plannerActionHistoryRows([
        {
          actionType: "Machine Switch",
          createdAt: "2026-08-16T12:00:00.000Z",
          fromMachine: "ADD503",
          setupNo: "2",
          target: "JC-004",
          toMachine: "ADD504",
        },
        {
          actionType: "Route Change",
          createdAt: "2026-08-16T12:30:00.000Z",
          newOption: "3",
          remainingSetups: [
            { plan: true, setupNo: "5" },
            { plan: false, setupNo: "6" },
          ],
          target: "JC-005",
        },
      ])
    ).toMatchObject([
      {
        "Job Card": "JC-004",
        "Machine / Route": "ADD503 → ADD504",
        Setups: "2",
      },
      {
        Decision: "Plan 5; Skip 6",
        "Job Card": "JC-005",
        "Machine / Route": "Route 3",
        Setups: "5, 6",
      },
    ])
  })
})
