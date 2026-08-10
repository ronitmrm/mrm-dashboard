import { describe, expect, it } from "vitest"

import {
  columnsForProductionMaster,
  dataEntryRowsForProductionMaster,
  productionMasterRowSources,
  rowsForProductionMaster,
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

  it("shows only populated form fields as columns", () => {
    const fields = [
      { name: "machineNo", label: "Machine No." },
      { name: "machineFamily", label: "Machine Family" },
      { name: "machineType", label: "Machine Type" },
      { name: "machineName", label: "Machine Name" },
      { name: "location", label: "Machine Location" },
      { name: "capacity", label: "Capacity" },
      { name: "status", label: "Status" },
    ]
    const rows = [
      {
        machineNo: "A-01",
        machineFamily: "A",
        machineType: "Automatic",
        machineName: "Turning centre",
        location: "",
        capacity: null,
        status: "Active",
        ownerId: "metadata-owner",
        output: 42,
      },
    ]

    expect(columnsForProductionMaster(fields, rows, [
      "machineNo",
      "machineFamily",
      "machineType",
      "machineName",
      "location",
    ])).toEqual([
      { key: "machineNo", label: "Machine No." },
      { key: "machineFamily", label: "Machine Family" },
      { key: "machineType", label: "Machine Type" },
      { key: "machineName", label: "Machine Name" },
      { key: "location", label: "Machine Location" },
      { key: "status", label: "Status" },
    ])
  })

  it("keeps populated zero and false values", () => {
    const fields = [
      { name: "capacity", label: "Capacity" },
      { name: "required", label: "Required" },
    ]

    expect(
      columnsForProductionMaster(fields, [{ capacity: 0, required: false }])
    ).toEqual([
      { key: "capacity", label: "Capacity" },
      { key: "required", label: "Required" },
    ])
  })
})
