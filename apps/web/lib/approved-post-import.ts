import { csvValue, type MasterCsvRow } from "./master-data-csv"

export type ApprovedPostCsvInput = {
  departmentCode: string
  designationCode: string
  requirementTemplateCode: string
}

export function approvedPostInputFromCsvRow(
  row: MasterCsvRow,
  csvRow: number
): ApprovedPostCsvInput {
  const departmentCode = csvValue(row, "department_code", "department")
  const designationCode = csvValue(row, "designation_code", "designation")
  if (!departmentCode || !designationCode) {
    throw new Error(
      `CSV row ${csvRow}: Department Code and Designation Code are required.`
    )
  }
  return {
    departmentCode,
    designationCode,
    requirementTemplateCode: csvValue(
      row,
      "requirement_template_code",
      "job_template_code",
      "template_code"
    ),
  }
}