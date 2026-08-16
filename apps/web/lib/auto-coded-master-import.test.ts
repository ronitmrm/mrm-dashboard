import { describe, expect, test, vi } from "vitest"

import {
  autoCodedMasterTemplateFields,
  importAutoCodedMasterRows,
} from "./auto-coded-master-import"

describe("auto-coded master CSV imports", () => {
  test("keeps codes system-generated while preserving checklist row groups", async () => {
    expect(
      autoCodedMasterTemplateFields("rejection_type_master", [
        "code",
        "typeOfRejection",
        "status",
      ])
    ).toEqual(["typeOfRejection", "status"])
    expect(
      autoCodedMasterTemplateFields("setup_checklist_master", [
        "checklistCode",
        "checklistTitle",
        "sequence",
      ])
    ).toEqual(["checklistTitle", "sequence"])

    const savedCodes = ["RT002", "RT003"]
    const savedRejectionRows: Record<string, unknown>[] = []
    const saveRejection = vi.fn(async (row: Record<string, unknown>) => {
      savedRejectionRows.push(row)
      return {
        code: savedCodes.shift()!,
        id: crypto.randomUUID(),
      }
    })
    await importAutoCodedMasterRows(
      "rejection_type_master",
      [
        { code: "R1", typeOfRejection: "Crack" },
        { code: "R2", typeOfRejection: "Dent" },
      ],
      saveRejection
    )
    expect(savedRejectionRows.map((row) => row.code)).toEqual(["", ""])

    const savedSetupRows: Record<string, unknown>[] = []
    const saveSetupChecklist = vi.fn(
      async (row: Record<string, unknown>) => {
        savedSetupRows.push(row)
        return { code: "SC002", id: crypto.randomUUID() }
      }
    )
    await importAutoCodedMasterRows(
      "setup_checklist_master",
      [
        { checklistCode: "R1", checklistTitle: "Setup", sequence: 1 },
        { checklistCode: "R1", checklistTitle: "Setup", sequence: 2 },
      ],
      saveSetupChecklist
    )
    expect(
      savedSetupRows.map((row) => row.checklistCode)
    ).toEqual(["", "SC002"])

    const savedMaintenanceRows: Record<string, unknown>[] = []
    const saveMaintenanceChecklist = vi.fn(
      async (row: Record<string, unknown>) => {
        savedMaintenanceRows.push(row)
        return { code: "MC002", id: crypto.randomUUID() }
      }
    )
    await importAutoCodedMasterRows(
      "maintenance_checklist_master",
      [
        { checklistCode: "R1", checklistTitle: "Maintenance", sequence: 1 },
        { checklistCode: "R1", checklistTitle: "Maintenance", sequence: 2 },
      ],
      saveMaintenanceChecklist
    )
    expect(
      savedMaintenanceRows.map((row) => row.checklistCode)
    ).toEqual(["", "MC002"])
  })
})
