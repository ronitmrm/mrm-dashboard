import { describe, expect, it } from "vitest"

import { maintenanceChecklistRowsForSchedule } from "./maintenance-schedule-options"

describe("maintenance schedule checklist options", () => {
  it("includes a saved checklist projected only through production control", () => {
    const checklist = {
      checklistCode: "MCL-100",
      checklistTitle: "Monthly lubrication",
      entryType: "maintenance_checklist_master",
      status: "Active",
      stepDescription: "Lubricate all bearings",
    }

    expect(
      maintenanceChecklistRowsForSchedule(
        { maintenanceChecklistMasterRows: [] },
        { maintenanceChecklistMasterRows: [checklist] }
      )
    ).toContainEqual(checklist)
  })
})
