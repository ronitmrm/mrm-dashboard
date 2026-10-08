import { createEmployeeDataRepository, createRecruitmentRepository, groupEmployeeTerms } from "@workspace/db"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { masterCapability } from "@/lib/auth/master-capabilities"
import { requireCapability } from "@/lib/auth/require-capability"
import { employeeDataCsvColumns, employeeDataLabels, employeeDepartmentLabel } from "@/lib/employee-data-csv"
import { masterCsvResponse } from "@/lib/master-data-csv"

export const dynamic = "force-dynamic"

export async function GET() {
  await requireCapability(masterCapability("employee_assignments", "read"), "/hr?panel=employeeDataPanel")
  const connectionString = readAuthEnvironment().connectionString
  const recruitment = createRecruitmentRepository({ connectionString })
  const employeeData = createEmployeeDataRepository({ connectionString })
  try {
    const organizationId = await recruitment.organizationIdForCode("MRMPL")
    const terms = groupEmployeeTerms(await recruitment.listEmployeeAssignments(organizationId))
      .sort((left, right) => (right.joinedOn ?? "").localeCompare(left.joinedOn ?? ""))
    const details = new Map((await employeeData.listDetails(organizationId, terms.map((term) => term.anchorId)))
      .map((record) => [record.assignmentId, record]))
    const rows = terms.map((term) => {
      const record = details.get(term.anchorId)!
      return {
        "Assignment ID": term.anchorId, "Employee ID": term.employeeCode,
        "Employee Name": term.assignments[0]!.employeeName,
        "Department / Combined ID": employeeDepartmentLabel(term.assignments),
        Designation: [...new Set(term.assignments.map((assignment) => assignment.designation).filter(Boolean))].join(", "),
        Joined: term.joinedOn, Left: term.endedOn,
        ...Object.fromEntries(Object.entries({ ...record.personal, ...record.term })
          .map(([field, value]) => [employeeDataLabels[field as keyof typeof employeeDataLabels], value])),
      }
    })
    const response = masterCsvResponse(rows, "employee-data.csv", employeeDataCsvColumns)
    response.headers.set("Cache-Control", "private, no-store")
    return response
  } finally {
    await Promise.all([recruitment.close(), employeeData.close()])
  }
}
