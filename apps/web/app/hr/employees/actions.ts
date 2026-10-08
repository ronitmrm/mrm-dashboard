"use server"

import {
  createEmployeeDataRepository, createRecruitmentRepository,
  employeePersonalFields, employeeTermFields, groupEmployeeTerms,
  type EmployeePersonalDetails, type EmployeeTermDetails,
} from "@workspace/db"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"
import { masterCapability } from "@/lib/auth/master-capabilities"
import { withCsvImportFeedback } from "@/lib/csv-import-action-feedback"
import { employeeDataInputFromCsvRow } from "@/lib/employee-data-csv"
import { readMasterCsv } from "@/lib/master-data-csv"

function values<const T extends readonly string[]>(formData: FormData, fields: T): Record<T[number], string> {
  return Object.fromEntries(fields.map((field) => [field, formData.get(field)?.toString() ?? ""])) as Record<T[number], string>
}

export async function saveEmployeeDataAction(formData: FormData) {
  const assignmentId = formData.get("assignment_id")?.toString() ?? ""
  if (!/^[0-9a-f-]{36}$/i.test(assignmentId)) redirect("/hr?panel=employeeDataPanel")
  const returnPath = `/hr/employees/${assignmentId}`
  const session = await requireCapability(masterCapability("employee_assignments", "save"), returnPath)
  const connectionString = readAuthEnvironment().connectionString
  const recruitment = createRecruitmentRepository({ connectionString })
  const employeeData = createEmployeeDataRepository({ connectionString })
  let outcome: { error?: string; success?: string }
  try {
    const organizationId = await recruitment.organizationIdForCode("MRMPL")
    await employeeData.save({
      actorUserId: session.user.id,
      organizationId,
      assignmentId,
      personal: values(formData, employeePersonalFields) satisfies EmployeePersonalDetails,
      term: values(formData, employeeTermFields) satisfies EmployeeTermDetails,
    })
    outcome = { success: "Employee data saved." }
  } catch (error) {
    outcome = { error: error instanceof Error ? error.message : "Employee data was not saved." }
  } finally {
    await Promise.all([recruitment.close(), employeeData.close()])
  }
  revalidatePath(returnPath)
  revalidatePath("/hr")
  redirect(`${returnPath}?${new URLSearchParams(outcome)}`)
}

export async function importEmployeeDataCsvAction(formData: FormData) {
  return withCsvImportFeedback(async () => {
    const returnPath = "/hr?panel=employeeDataPanel"
    const session = await requireCapability(masterCapability("employee_assignments", "import"), returnPath)
    const rows = await readMasterCsv(formData.get("master_csv_file"), "Employee Data CSV")
    const inputs = rows.map((row, index) => employeeDataInputFromCsvRow(row, index + 2))
    const connectionString = readAuthEnvironment().connectionString
    const recruitment = createRecruitmentRepository({ connectionString })
    const employeeData = createEmployeeDataRepository({ connectionString })
    try {
      const organizationId = await recruitment.organizationIdForCode("MRMPL")
      const terms = new Map(groupEmployeeTerms(await recruitment.listEmployeeAssignments(organizationId))
        .map((term) => [term.anchorId, term]))
      const seenAssignments = new Set<string>()
      const personalByEmployee = new Map<string, string>()
      for (const [index, input] of inputs.entries()) {
        if (terms.get(input.assignmentId)?.employeeCode !== input.employeeCode) {
          throw new Error(`CSV row ${index + 2}: Employee ID does not match an existing employment term. Download a fresh CSV.`)
        }
        if (seenAssignments.has(input.assignmentId)) {
          throw new Error(`CSV row ${index + 2}: This employment term appears more than once.`)
        }
        seenAssignments.add(input.assignmentId)
        const personal = JSON.stringify(input.personal)
        const previous = personalByEmployee.get(input.employeeCode)
        if (previous && previous !== personal) {
          throw new Error(`CSV row ${index + 2}: Personal details must match across rows for Employee ID ${input.employeeCode}.`)
        }
        personalByEmployee.set(input.employeeCode, personal)
      }
      await employeeData.saveMany(inputs.map((input) => ({ ...input, organizationId, actorUserId: session.user.id })))
    } finally {
      await Promise.all([recruitment.close(), employeeData.close()])
    }
    revalidatePath("/hr")
    revalidatePath("/hr/employees/[id]", "page")
    redirect(`${returnPath}&success=${encodeURIComponent(`${inputs.length} employee data row${inputs.length === 1 ? "" : "s"} imported.`)}`)
  }, "Employee Data CSV was not imported.")
}
