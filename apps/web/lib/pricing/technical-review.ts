export const technicalReviewChecklist = [
  ["drawing_available", "Customer drawing/reference available"],
  ["grade_material_clear", "Grade / material is clear"],
  ["drawing_information_complete", "All information available in drawing"],
  ["finish_plating_clear", "Finish / plating requirement is clear"],
  ["packaging_clear", "Packaging / special requirement is clear"],
  ["tooling_process_feasible", "Tooling and process are feasible"],
] as const

export const technicalReviewStatuses = [
  "Pending Review",
  "Need Clarification",
  "Feasible",
  "Not Feasible",
  "Duplicate / Existing Product",
] as const

export function technicalReviewChecklistFromFormData(formData: FormData) {
  return Object.fromEntries(
    technicalReviewChecklist.map(([key]) => [key, formData.get(key) === "on"])
  )
}

export function countTechnicalReviewChecks(
  checklist: Readonly<Record<string, boolean>>
) {
  let checked = 0
  for (const [key] of technicalReviewChecklist) {
    if (checklist[key]) checked += 1
  }
  return checked
}

export function technicalReviewReturnPath(
  status: string,
  enquiryItemId: string
) {
  return status === "Pending Review"
    ? `/commercial/technical-review/${enquiryItemId}`
    : "/commercial/technical-review"
}
