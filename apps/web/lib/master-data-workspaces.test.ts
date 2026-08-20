import { describe, expect, it } from "vitest"

import {
  immutableMasterFields,
  masterEditDefaults,
  masterDataEntryTypes,
  operationalDataEntryTypes,
} from "./master-data-workspaces"

describe("master data workspaces", () => {
  it("keeps reusable masters separate from operational entries", () => {
    expect(masterDataEntryTypes).toEqual([
      "setup_name_master",
      "route",
      "cycle",
      "tooling",
      "machine_master",
      "setup_checklist_master",
      "maintenance_checklist_master",
      "maintenance_master",
      "rejection_type_master",
      "rejection_remark_master",
      "rejection_reason_master",
      "quality_parameter_master",
      "planning_holiday",
      "store_masters",
    ])
    expect(operationalDataEntryTypes).toEqual([
      "work_order",
      "rm_inward",
      "software_raw",
    ])
  })

  it("preserves the existing identity when a master is opened for editing", () => {
    expect(
      masterEditDefaults("rejection_type_master", {
        _id: "source-17",
        code: "RT004",
        typeOfRejection: "Crack",
      })
    ).toEqual({
      __editingMaster: true,
      __entryId: "source-17",
      __returnTab: "masterTablesTab",
      _id: "source-17",
      code: "RT004",
      typeOfRejection: "Crack",
    })
    expect(immutableMasterFields("rejection_type_master")).toEqual(["code"])
    expect(immutableMasterFields("route")).toEqual([
      "partNo",
      "optionNumber",
      "setupNo",
    ])
  })
})
