import { describe, expect, it } from "vitest"

import {
  masterDataEntryTypes,
  operationalDataEntryTypes,
} from "./master-data-workspaces"

describe("master data workspaces", () => {
  it("keeps reusable masters separate from operational entries", () => {
    expect(masterDataEntryTypes).toEqual([
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
})
