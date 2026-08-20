import { describe, expect, test } from "vitest"

import {
  countTechnicalReviewChecks,
  technicalReviewChecklist,
  technicalReviewChecklistFromFormData,
  technicalReviewStatuses,
} from "./technical-review"

describe("technical review workflow", () => {
  test("preserves the Pricing checklist, decisions, and open-work summary", () => {
    expect(technicalReviewChecklist).toEqual([
      ["drawing_available", "Customer drawing/reference available"],
      ["grade_material_clear", "Grade / material is clear"],
      ["drawing_information_complete", "All information available in drawing"],
      ["finish_plating_clear", "Finish / plating requirement is clear"],
      ["packaging_clear", "Packaging / special requirement is clear"],
      ["tooling_process_feasible", "Tooling and process are feasible"],
    ])
    expect(technicalReviewStatuses).toEqual([
      "Pending Review",
      "Need Clarification",
      "Feasible",
      "Not Feasible",
      "Duplicate / Existing Product",
    ])
    const formData = new FormData()
    formData.set("drawing_available", "on")
    formData.set("packaging_clear", "on")
    const checklist = technicalReviewChecklistFromFormData(formData)
    expect(checklist).toEqual({
      drawing_available: true,
      drawing_information_complete: false,
      finish_plating_clear: false,
      grade_material_clear: false,
      packaging_clear: true,
      tooling_process_feasible: false,
    })
    expect(countTechnicalReviewChecks(checklist)).toBe(2)
  })
})
