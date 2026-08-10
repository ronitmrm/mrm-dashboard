import { describe, expect, it } from "vitest"

import {
  columnsForProductionMaster,
  dataEntryRowsForProductionMaster,
  productionMasterRowSources,
  rowsForProductionMaster,
  uniqueChecklistCodeCount,
} from "./production-master-tables"

describe("Production master table rows", () => {
  it("does not show rows explicitly belonging to another master", () => {
    const route = { entryType: "route", partNo: "P-1" }
    const machine = { entryType: "machine_master", machineNo: "1" }
    const legacyRoute = { partNo: "P-2" }

    expect(
      rowsForProductionMaster("route", [route, machine, legacyRoute])
    ).toEqual([route, legacyRoute])
  })

  it("does not render Excel template metadata as a master row", () => {
    const route = { entryType: "route", partNo: "P-1" }
    const template = { entryType: "route", format: "xlsx" }

    expect(
      dataEntryRowsForProductionMaster("route", {
        rows: [route],
        templates: [template],
      })
    ).toEqual([route])
  })

  it("uses only canonical master row sources", () => {
    expect(productionMasterRowSources.machine_master).toEqual([
      "machinePlanningRows",
    ])
    expect(productionMasterRowSources.route).toEqual(["routeMasterRows"])
  })

  it("shows every configured master column even when values are blank", () => {
    const fields = [
      { name: "machineNo", label: "Machine No." },
      { name: "machineFamily", label: "Machine Family" },
      { name: "machineType", label: "Machine Type" },
      { name: "machineName", label: "Machine Name" },
      { name: "location", label: "Machine Location" },
      { name: "capacity", label: "Capacity" },
      { name: "status", label: "Status" },
    ]
    expect(columnsForProductionMaster(fields)).toEqual([
      { key: "machineNo", label: "Machine No." },
      { key: "machineFamily", label: "Machine Family" },
      { key: "machineType", label: "Machine Type" },
      { key: "machineName", label: "Machine Name" },
      { key: "location", label: "Machine Location" },
      { key: "capacity", label: "Capacity" },
      { key: "status", label: "Status" },
    ])
  })

  it("keeps every configured column when rows contain zero and false values", () => {
    const fields = [
      { name: "capacity", label: "Capacity" },
      { name: "required", label: "Required" },
    ]

    expect(
      columnsForProductionMaster(fields)
    ).toEqual([
      { key: "capacity", label: "Capacity" },
      { key: "required", label: "Required" },
    ])
  })

  it("counts checklist codes rather than checklist step rows", () => {
    expect(
      uniqueChecklistCodeCount("maintenance_checklist_master", [
        { checklistCode: "MC001", sequence: 1 },
        { checklistCode: "MC001", sequence: 2 },
        { checklistCode: "MC002", sequence: 1 },
      ])
    ).toBe(2)
    expect(
      uniqueChecklistCodeCount("setup_checklist_master", [
        { checklistCode: "SC001", sequence: 1 },
        { checklistCode: "SC001", sequence: 2 },
        { version: "legacy-v2", sequence: 1 },
      ])
    ).toBe(2)
  })
})
