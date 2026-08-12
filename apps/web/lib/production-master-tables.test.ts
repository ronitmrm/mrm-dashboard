import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import {
  checklistWorkspaceEntryTypes,
  companyWideQualityMasterEntryTypes,
  columnsForProductionMaster,
  dataEntryRowsForProductionMaster,
  productionMasterTableEntryTypes,
  productionMasterRowSources,
  qualityWorkspaceEntryTypes,
  productionUnitQualityMasterEntryTypes,
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
    expect(productionMasterRowSources.machine_master).toBeUndefined()
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

  it("shows checklist data in the universal Master Tables workspace", () => {
    expect(checklistWorkspaceEntryTypes).toEqual([
      "setup_checklist_master",
      "maintenance_checklist_master",
    ])
    expect(productionMasterTableEntryTypes).toEqual(
      expect.arrayContaining([...checklistWorkspaceEntryTypes])
    )
  })

  it("shows all quality masters and records their ownership", () => {
    expect(qualityWorkspaceEntryTypes).toEqual([
      "quality_parameter_master",
      "rejection_type_master",
      "rejection_remark_master",
      "rejection_reason_master",
    ])
    for (const entryType of qualityWorkspaceEntryTypes) {
      expect(productionMasterTableEntryTypes).toContain(entryType)
    }
    expect(companyWideQualityMasterEntryTypes).toEqual([
      "rejection_type_master",
      "rejection_remark_master",
      "rejection_reason_master",
    ])
    expect(productionUnitQualityMasterEntryTypes).toEqual([
      "quality_parameter_master",
    ])
  })

  it("uses the shared HR Employee Master instead of a Production master", () => {
    expect(productionMasterTableEntryTypes).not.toContain("employee")
    expect(productionMasterRowSources.employee).toBeUndefined()
  })

  it("keeps the central Machine Master outside Production master tables", () => {
    expect(productionMasterTableEntryTypes).not.toContain("machine_master")
    expect(productionMasterRowSources.machine_master).toBeUndefined()
  })

  it("uses the Route Master line as the quality parameter set selector", () => {
    const source = readFileSync(
      new URL("../components/mrmpl-dashboard.tsx", import.meta.url),
      "utf8"
    )

    expect(source).not.toContain('Field label="Saved Parameter Set"')
    expect(source).toContain('Field label="Item Code"')
    expect(source).toContain('Field label="Option No."')
    expect(source).toContain('Field label="Setup No."')
  })
})
