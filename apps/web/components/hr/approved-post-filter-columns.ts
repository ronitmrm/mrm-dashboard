export type ApprovedPostFilterKey =
  | "postCode"
  | "vacancyCode"
  | "department"
  | "designation"
  | "template"
  | "employeeName"
  | "employeeCode"
  | "joiningDate"
  | "lastWorkingDate"
  | "status"

export const APPROVED_POST_FILTER_COLUMNS: ReadonlyArray<{
  key: ApprovedPostFilterKey
  label: string
}> = [
  { key: "postCode", label: "Post Code" },
  { key: "vacancyCode", label: "Vacancy Code" },
  { key: "department", label: "Department" },
  { key: "designation", label: "Designation" },
  { key: "template", label: "Template" },
  { key: "employeeName", label: "Employee Name" },
  { key: "employeeCode", label: "Employee Code" },
  { key: "joiningDate", label: "Joining Date" },
  { key: "lastWorkingDate", label: "Last Working Date" },
  { key: "status", label: "Status" },
]
