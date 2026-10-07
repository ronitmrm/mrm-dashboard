"use server"

import {
  createEmployeeDataRepository, createRecruitmentRepository,
  employeePersonalFields, employeeTermFields,
  type EmployeePersonalDetails, type EmployeeTermDetails,
} from "@workspace/db"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"
import { masterCapability } from "@/lib/auth/master-capabilities"

function values<const T extends readonly string[]>(formData: FormData, fields: T): Record<T[number], string> {
  return Object.fromEntries(fields.map((field) => [field, formData.get(field)?.toString() ?? ""])) as Record<T[number], string>
}

export async function saveEmployeeDataAction(formData: FormData) {
  const assignmentId = formData.get("assignment_id")?.toString() ?? ""
  if (!/^[0-9a-f-]{36}$/i.test(assignmentId)) redirect("/hr?panel=employeeMasterPanel")
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
