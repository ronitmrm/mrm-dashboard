import { describe, expect, it } from "vitest"

import {
  mergeFirstPieceInspectionTasks,
  readFirstPieceInspectionDraft,
  readFirstPieceInspectionTasks,
  removeFirstPieceInspectionDraft,
  writeFirstPieceInspectionDraft,
  writeFirstPieceInspectionTasks,
} from "./first-piece-inspection-draft"

function memoryStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => {
      values.delete(key)
    },
    setItem: (key: string, value: string) => {
      values.set(key, value)
    },
  }
}

describe("first-piece inspection browser drafts", () => {
  it("keeps opened tasks available and deduplicates them by plan key", () => {
    const storage = memoryStorage()
    const originalTask = { planKey: "jc-1", item: "M1" }
    const updatedTask = { planKey: "jc-1", item: "M1 updated" }
    const secondTask = { planKey: "jc-2", item: "M2" }

    writeFirstPieceInspectionTasks(storage, [originalTask])

    expect(
      mergeFirstPieceInspectionTasks(
        (task) => String(task.planKey ?? ""),
        readFirstPieceInspectionTasks(storage),
        [updatedTask, secondTask]
      )
    ).toEqual([updatedTask, secondTask])
  })

  it("restores unfinished approver, remark, and piece readings", () => {
    const storage = memoryStorage()

    writeFirstPieceInspectionDraft(storage, "report-1", {
      approvedBy: "QC-12",
      readings: { diameter: ["10.01", "10.02", "", "", ""] },
      remark: "Continue after break",
    })

    expect(readFirstPieceInspectionDraft(storage, "report-1")).toEqual({
      approvedBy: "QC-12",
      readings: { diameter: ["10.01", "10.02", "", "", ""] },
      remark: "Continue after break",
    })
  })

  it("removes a draft after the inspection is completed", () => {
    const storage = memoryStorage()
    writeFirstPieceInspectionDraft(storage, "report-1", {
      approvedBy: "",
      readings: {},
      remark: "",
    })

    removeFirstPieceInspectionDraft(storage, "report-1")

    expect(readFirstPieceInspectionDraft(storage, "report-1")).toBeUndefined()
  })
})
