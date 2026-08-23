"use server"

import { createRecruitmentRepository } from "@workspace/db"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"
import { hrTaskCapabilities } from "@/lib/auth/task-capabilities"
import { approvedPostInputFromCsvRow } from "@/lib/approved-post-import"
import { candidateInputFromCsvRow } from "@/lib/candidate-import"
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

export async function importApprovedPostsCsvAction(formData: FormData) {
  const returnParams = new URLSearchParams({
    masterView: "dataEntry",
    panel: "approvedPostPanel",
  })
  for (const key of ["masterUnit", "masterMain", "masterSub"]) {
    const value = formData.get(key)?.toString().trim()
    if (value) returnParams.set(key, value)
  }
  const returnPath = `${hrPath}?${returnParams}`
  let context: Awaited<ReturnType<typeof repositoryContext>> | undefined
  let outcome: { error?: string; success?: string }
  try {
    const rows = await readMasterCsv(formData.get("master_csv_file"))
    const inputs = rows.map((row, index) =>
      approvedPostInputFromCsvRow(row, index + 2)
    )
    context = await repositoryContext(hrTaskCapabilities.savePost)
    for (const input of inputs) {
      await context.repository.upsertPost({
        ...input,
        actorUserId: context.actorUserId,
        organizationId: context.organizationId,
      })
    }
    outcome = {
      success: `${inputs.length} approved post${inputs.length === 1 ? "" : "s"} imported successfully.`,
    }
  } catch (error) {
    outcome = {
      error:
        error instanceof Error
          ? error.message
          : "The Approved Posts CSV was not imported.",
    }
  } finally {
    await context?.repository.close()
  }
  revalidatePath(hrPath)
  redirect(`${returnPath}&${new URLSearchParams(outcome)}`)
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

export async function importCandidatesCsvAction(formData: FormData) {
  const returnParams = new URLSearchParams({
    masterView: "dataEntry",
    panel: "candidatesPanel",
  })
  for (const key of ["masterUnit", "masterMain", "masterSub"]) {
    const value = formData.get(key)?.toString().trim()
    if (value) returnParams.set(key, value)
  }
  const returnPath = `${hrPath}?${returnParams}`
  let context: Awaited<ReturnType<typeof repositoryContext>> | undefined
  let outcome: { error?: string; success?: string }
  try {
    const rows = await readMasterCsv(
      formData.get("master_csv_file"),
      "Candidate CSV"
    )
    const inputs = rows.map((row, index) =>
      candidateInputFromCsvRow(row, index + 2)
    )
    context = await repositoryContext(hrTaskCapabilities.saveCandidate)
    for (const input of inputs) {
      await context.repository.upsertCandidate({
        ...input,
        actorUserId: context.actorUserId,
        organizationId: context.organizationId,
      })
    }
    outcome = {
      success: `${inputs.length} candidate${inputs.length === 1 ? "" : "s"} imported successfully.`,
    }
  } catch (error) {
    outcome = {
      error:
        error instanceof Error
          ? error.message
          : "The Candidate CSV was not imported.",
    }
  } finally {
    await context?.repository.close()
  }
  revalidatePath(hrPath)
  redirect(`${returnPath}&${new URLSearchParams(outcome)}`)
}
