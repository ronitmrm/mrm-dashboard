import { describe, expect, it } from "vitest"

import {
  maintenanceChecklistRowsForSchedule,
  maintenanceMasterRowsForMachineAssignment,
} from "./maintenance-schedule-options"

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

  it("includes a saved maintenance master projected through data entry", () => {
    const schedule = {
      entryType: "maintenance_master",
      maintenanceCode: "PM-304",
      maintenanceTitle: "A304 monthly service",
      status: "Active",
    }

    expect(
      maintenanceMasterRowsForMachineAssignment([
        {
          dataEntry: { maintenanceMasterRows: [schedule] },
          productionControl: { maintenanceMasterRows: [] },
        },
      ])
    ).toContainEqual(schedule)
  })

  it("keeps the saved data-entry version when another unit has a stale projection", () => {
    const current = {
      entryType: "maintenance_master",
      maintenanceCode: "PM-304",
      maintenanceTitle: "Current A304 service",
      status: "Active",
    }

    expect(
      maintenanceMasterRowsForMachineAssignment([
        { dataEntry: { maintenanceMasterRows: [current] } },
        {
          productionControl: {
            maintenanceMasterRows: [
              { ...current, maintenanceTitle: "Old A304 service" },
            ],
          },
        },
      ])
    ).toContainEqual(current)
  })
})
