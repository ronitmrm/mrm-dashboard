import {
  employeePersonalFields, employeeTermFields,
  type EmployeePersonalDetails, type EmployeeTermDetails,
  type RecruitmentEmployeeAssignmentRow,
} from "@workspace/db"

import { csvValue, type MasterCsvRow } from "./master-data-csv"

export const employeeDataLabels = {
  pfCode: "PF Code", dateOfBirth: "Date of Birth", contactNo: "Contact No",
  gender: "Gender", emailId: "Email ID", residenceAddress: "Residence Address",
  permanentAddress: "Permanent Address", bloodGroup: "Blood Group",
  emergencyContactNumber: "Emergency Contact Number", emergencyContactName: "Emergency Contact Name",
  nameAsPerBankRecord: "Name as per Bank Record", bankAccountNo: "Bank Account No",
  bankName: "Bank Name", branchName: "Branch Name", branchAddress: "Branch Address",
  ifscCode: "IFSC Code", uanNo: "UAN No", esicNo: "ESIC No", aadhaarCardNo: "Aadhaar Card No",
  shift: "Shift", salary: "Salary", salaryRateInc: "Salary Rate Inc",
  pfStatus: "PF Status", esicStatus: "ESIC Status",
} satisfies Record<(typeof employeePersonalFields)[number] | (typeof employeeTermFields)[number], string>

export const employeeDataCsvColumns = [
  "Assignment ID", "Employee ID", "Employee Name", "Department / Combined ID",
  "Designation", "Joined", "Left", ...Object.values(employeeDataLabels),
]

export function employeeDepartmentLabel(assignments: Pick<RecruitmentEmployeeAssignmentRow, "combinedVacancyCode" | "department">[]) {
  return [...new Set(assignments.map((assignment) =>
    assignment.combinedVacancyCode || assignment.department
  ).filter(Boolean))].join(", ") || "—"
}

function details<const T extends readonly (keyof typeof employeeDataLabels)[]>(row: MasterCsvRow, fields: T, rowNumber: number) {
  return Object.fromEntries(fields.map((field) => {
    const label = employeeDataLabels[field]
    const key = label.toLowerCase().replace(/[^a-z0-9]+/g, "_")
    if (!(key in row)) throw new Error(`CSV row ${rowNumber}: ${label} column is missing. Use Download CSV first.`)
    return [field, csvValue(row, label)]
  })) as Record<T[number], string>
}

export function employeeDataInputFromCsvRow(row: MasterCsvRow, rowNumber: number) {
  const assignmentId = csvValue(row, "Assignment ID")
  const employeeCode = csvValue(row, "Employee ID")
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(assignmentId) || !employeeCode) {
    throw new Error(`CSV row ${rowNumber}: Keep the Assignment ID and Employee ID from Download CSV.`)
  }
  return {
    assignmentId: assignmentId.toLowerCase(), employeeCode,
    personal: details(row, employeePersonalFields, rowNumber) satisfies EmployeePersonalDetails,
    term: details(row, employeeTermFields, rowNumber) satisfies EmployeeTermDetails,
  }
}
