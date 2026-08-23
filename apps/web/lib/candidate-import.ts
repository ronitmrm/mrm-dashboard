import { csvValue, type MasterCsvRow } from "./master-data-csv"

export function candidateInputFromCsvRow(row: MasterCsvRow, rowNumber: number) {
  const name = csvValue(row, "name", "candidate_name")
  const phone = csvValue(row, "phone", "phone_number", "mobile")
  if (!name || !phone) {
    throw new Error(
      `CSV row ${rowNumber}: Candidate Name and Phone are required.`
    )
  }
  return {
    currentCompany: csvValue(row, "current_company") || null,
    departmentCode:
      csvValue(row, "department_code", "preferred_department_code") || null,
    designationCode:
      csvValue(row, "designation_code", "preferred_designation_code") || null,
    email: csvValue(row, "email") || null,
    experience: csvValue(row, "experience") || null,
    name,
    notes: csvValue(row, "notes", "initial_notes") || null,
    phone,
    source: csvValue(row, "source") || null,
  }
}
