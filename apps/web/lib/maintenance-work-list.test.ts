import { describe, expect, test } from "vitest"

import { plannedMaintenanceScheduleRows, unifiedMechanicalWorkRows } from "./maintenance-work-list"

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
})
