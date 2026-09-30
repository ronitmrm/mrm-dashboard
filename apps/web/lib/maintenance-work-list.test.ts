import { describe, expect, test } from "vitest"

import { mechanicalWorkRowsForDate, plannedMaintenanceScheduleRows, unifiedMechanicalWorkRows } from "./maintenance-work-list"

describe("unified Mechanical work list", () => {
  test("excludes generated history backing rows from planned work", () => {
    expect(plannedMaintenanceScheduleRows([
      { generated: true, legacyHistory: true },
      { machineNo: "CNC-1", maintenanceCode: "MM001" },
    ])).toEqual([{ machineNo: "CNC-1", maintenanceCode: "MM001" }])
  })

  test("combines scheduled and request work while keeping urgent requests first", () => {
    const scheduled = {
      machineNo: "C501",
      nextDueDate: "2026-09-03",
      status: "Due",
    }
    const regular = {
      assigneeName: null,
      finalPriority: "Regular" as const,
      id: "request-regular",
      location: "Plant 2",
      problemDescription: "Guard vibration",
      status: "Approved" as const,
      submittedAt: "2026-09-01T10:00:00.000Z",
    }
    const urgent = {
      ...regular,
      finalPriority: "Urgent" as const,
      id: "request-urgent",
      problemDescription: "Hydraulic leak",
    }

    const rows = unifiedMechanicalWorkRows([scheduled], [regular, urgent])

    expect(rows.map(({ workType }) => workType)).toEqual([
      "Request",
      "Scheduled",
      "Request",
    ])
    expect(rows[0]).toMatchObject({
      description: "Hydraulic leak",
      priority: "Urgent",
      requestId: "request-urgent",
    })
    expect(rows[1]).toMatchObject({
      machineOrLocation: "C501",
      scheduled,
      workType: "Scheduled",
    })
  })

  test("identifies a scheduled physical asset by Unit ID", () => {
    expect(unifiedMechanicalWorkRows([{
      assetCode: "NC285-0001",
      maintenanceTitle: "Monthly inspection",
      nextDueDate: "2026-10-03",
    }], [])[0]).toMatchObject({
      machineOrLocation: "NC285-0001",
      workType: "Scheduled",
    })
  })

  test("shows only work on the selected IST calendar day", () => {
    const rows = unifiedMechanicalWorkRows(
      [{ machineNo: "CNC-1", nextDueDate: "2026-10-01" }],
      [{
        assigneeName: null,
        finalPriority: "Regular",
        id: "request-1",
        location: "Plant 2",
        problemDescription: "Repair guard",
        status: "Approved",
        submittedAt: "2026-09-30T20:00:00.000Z",
      }, {
        assigneeName: null,
        finalPriority: "Regular",
        id: "request-2",
        location: "Plant 2",
        problemDescription: "Check motor",
        status: "Approved",
        submittedAt: "2026-10-01T20:00:00.000Z",
      }]
    )

    expect(mechanicalWorkRowsForDate(rows, "2026-10-01").map((row) => row.machineOrLocation))
      .toEqual(["CNC-1", "Plant 2"])
    expect(mechanicalWorkRowsForDate(rows, "")).toBe(rows)
  })
})
