"use server"

import { createRecruitmentRepository } from "@workspace/db"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"
import { hrTaskCapabilities } from "@/lib/auth/task-capabilities"
import { csvValue, readMasterCsv } from "@/lib/master-data-csv"

const hrPath = "/hr"

async function repositoryContext(capability: string) {
  const session = await requireCapability(capability, hrPath)
  const repository = createRecruitmentRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const organizationId = await repository.organizationIdForCode("MRMPL")
  return { actorUserId: session.user.id, organizationId, repository }
}

export async function importRecruitmentMastersCsvAction(formData: FormData) {
  const kind =
    formData.get("master_kind")?.toString() === "designation"
      ? "designation"
      : "department"
  const rows = await readMasterCsv(formData.get("master_csv_file"))
  const context = await repositoryContext(
    hrTaskCapabilities.saveRecruitmentMaster
  )
  try {
    for (const [index, row] of rows.entries()) {
      const name = csvValue(row, "name", `${kind}_name`)
      if (!name) throw new Error(`CSV row ${index + 2}: Name is required.`)
      await context.repository.upsertMaster({
        actorUserId: context.actorUserId,
        kind,
        name,
        organizationId: context.organizationId,
      })
    }
  } finally {
    await context.repository.close()
  }
  revalidatePath(hrPath)
  redirect(`${hrPath}?panel=mastersPanel&masterView=dataEntry&kind=${kind}`)
}

export async function importJobTemplatesCsvAction(formData: FormData) {
  const rows = await readMasterCsv(formData.get("master_csv_file"))
  const context = await repositoryContext(hrTaskCapabilities.saveTemplate)
  try {
    for (const [index, row] of rows.entries()) {
      const templateCode = csvValue(row, "template_code")
      const name = csvValue(row, "name", "template_name")
      const designationCode = csvValue(row, "designation_code")
      if (!templateCode || !name || !designationCode) {
        throw new Error(
          `CSV row ${index + 2}: Template Code, Name and Designation Code are required.`
        )
      }
      await context.repository.upsertTemplate({
        actorUserId: context.actorUserId,
        combinedRoleId: csvValue(row, "combined_role_id") || null,
        departmentCode: csvValue(row, "department_code") || null,
        designationCode,
        education: csvValue(row, "education") || null,
        experienceRequirement: csvValue(row, "experience_requirement") || null,
        gender: csvValue(row, "gender") || null,
        maximumSalary: csvValue(row, "maximum_salary") || null,
        minimumSalary: csvValue(row, "minimum_salary") || null,
        name,
        organizationId: context.organizationId,
        roleResponsibilities: csvValue(row, "role_responsibilities") || null,
        templateCode,
      })
    }
  } finally {
    await context.repository.close()
  }
  revalidatePath(hrPath)
  redirect(`${hrPath}?panel=postMasterPanel&masterView=dataEntry`)
}
