import { describe, expect, test } from "vitest"

import { unifiedMechanicalWorkRows } from "./maintenance-work-list"

describe("unified Mechanical work list", () => {
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
})
