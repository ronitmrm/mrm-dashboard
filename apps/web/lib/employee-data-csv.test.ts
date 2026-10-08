import { expect, test } from "vitest"

import { employeeDataCsvColumns, employeeDataInputFromCsvRow, employeeDataLabels, employeeDepartmentLabel } from "./employee-data-csv"
import { masterCsvResponse, readMasterCsv } from "./master-data-csv"

test("Employee Data CSV round-trips editable details and uses the combined code", async () => {
  const row = {
    ...Object.fromEntries(Object.values(employeeDataLabels).map((label) => [label, ""])),
    "Assignment ID": "11111111-1111-4111-8111-111111111111", "Employee ID": "007",
    "Employee Name": "Employee", "Bank Account No": "0012345678",
    "Residence Address": "Street 1, Building A\nFloor 2", Salary: "20000.50",
  }
  const csv = await masterCsvResponse([row], "employee-data.csv", employeeDataCsvColumns).text()
  const [parsed] = await readMasterCsv(new File([csv], "employee-data.csv"))
  expect(employeeDataInputFromCsvRow(parsed!, 2)).toMatchObject({
    assignmentId: row["Assignment ID"], employeeCode: "007",
    personal: { bankAccountNo: "0012345678", residenceAddress: row["Residence Address"] },
    term: { salary: "20000.50" },
  })
  expect(employeeDepartmentLabel([
    { combinedVacancyCode: "CMB-1", department: "Assembly" },
    { combinedVacancyCode: "CMB-1", department: "Quality Control" },
    { combinedVacancyCode: null, department: "Human Resources" },
  ])).toBe("CMB-1, Human Resources")
})

test("Employee Data uploads reject missing detail columns instead of clearing them", () => {
  expect(() => employeeDataInputFromCsvRow({
    assignment_id: "11111111-1111-4111-8111-111111111111", employee_id: "007",
  }, 2)).toThrow("PF Code column is missing")
})
