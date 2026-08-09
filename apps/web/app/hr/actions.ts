"use server"

import { createHash, randomUUID } from "node:crypto"
import { mkdir, unlink, writeFile } from "node:fs/promises"
import nodePath from "node:path"

import {
  createRecruitmentRepository,
  recruitmentInterviewRound,
} from "@workspace/db"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import * as XLSX from "xlsx"

import { parseEmployeeAssignmentWorkbook } from "@/app/hr/employee-assignment-workbook"
import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"

const hrPath = "/hr"

function value(formData: FormData, key: string) {
  return formData.get(key)?.toString().trim() ?? ""
}

function values(formData: FormData, key: string) {
  return formData
    .getAll(key)
    .map((entry) => entry.toString().trim())
    .filter(Boolean)
}

function returnPath(formData: FormData) {
  const returnJobId = value(formData, "return_job_id")
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      returnJobId
    )
  ) {
    return `${hrPath}/jobs/${returnJobId}`
  }
  const panel = value(formData, "panel")
  const params = new URLSearchParams({ panel: panel || "mastersPanel" })
  const selectedJobId = value(formData, "job_id")
  if (
    panel === "candidateSearchPanel" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      selectedJobId
    )
  ) {
    params.set("job", selectedJobId)
  }
  return `${hrPath}?${params}`
}

async function mutate(
  formData: FormData,
  capability: "hr.employees.write" | "hr.recruitment.write",
  operation: (
    repository: ReturnType<typeof createRecruitmentRepository>,
    context: { actorUserId: string; organizationId: string }
  ) => Promise<unknown>,
  successMessage = "Saved successfully."
) {
  const path = returnPath(formData)
  const session = await requireCapability(capability, path)
  const repository = createRecruitmentRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  let outcome: { error?: string; success?: string }
  try {
    const organizationId = await repository.organizationIdForCode("MRMPL")
    await operation(repository, {
      actorUserId: session.user.id,
      organizationId,
    })
    outcome = { success: successMessage }
  } catch (error) {
    outcome = {
      error:
        error instanceof Error ? error.message : "The HR record was not saved.",
    }
  } finally {
    await repository.close()
  }
  revalidatePath(hrPath)
  if (path !== hrPath) revalidatePath(path)
  const feedback = new URLSearchParams(outcome)
  redirect(`${path}${path.includes("?") ? "&" : "?"}${feedback}`)
}

export async function saveMasterAction(formData: FormData) {
  await mutate(formData, "hr.recruitment.write", (repository, context) =>
    repository.upsertMaster({
      ...context,
      code: value(formData, "code"),
      kind:
        value(formData, "kind") === "designation"
          ? "designation"
          : "department",
      name: value(formData, "name"),
    })
  )
}

export async function saveTemplateAction(formData: FormData) {
  await mutate(formData, "hr.recruitment.write", (repository, context) =>
    repository.upsertTemplate({
      ...context,
      departmentCode: value(formData, "department_code"),
      designationCode: value(formData, "designation_code"),
      education: value(formData, "education"),
      experienceRequirement: value(formData, "experience_requirement"),
      gender: value(formData, "gender"),
      maximumSalary: value(formData, "maximum_salary"),
      minimumSalary: value(formData, "minimum_salary"),
      name: value(formData, "name"),
      roleResponsibilities: value(formData, "role_responsibilities"),
      templateCode: value(formData, "template_code"),
    })
  )
}

export async function savePostAction(formData: FormData) {
  await mutate(formData, "hr.recruitment.write", (repository, context) =>
    repository.upsertPost({
      ...context,
      departmentCode: value(formData, "department_code"),
      designationCode: value(formData, "designation_code"),
      requirementTemplateCode: value(formData, "requirement_template_code"),
    })
  )
}

export async function updatePostAction(formData: FormData) {
  await mutate(
    formData,
    "hr.recruitment.write",
    (repository, context) =>
      repository.updatePost({
        ...context,
        postId: value(formData, "post_id"),
        requirementTemplateCode: value(formData, "requirement_template_code"),
      }),
    "Approved post updated."
  )
}

export async function deletePostAction(formData: FormData) {
  await mutate(
    formData,
    "hr.recruitment.write",
    (repository, context) =>
      repository.deletePost({
        ...context,
        postId: value(formData, "post_id"),
      }),
    "Approved post deleted."
  )
}

export async function createCombinedRoleAction(formData: FormData) {
  await mutate(formData, "hr.recruitment.write", (repository, context) =>
    repository.createCombinedRole({
      ...context,
      name: value(formData, "name"),
      postIds: values(formData, "post_ids"),
      primaryPostId: value(formData, "primary_post_id"),
    })
  )
}

export async function updateCombinedRoleAction(formData: FormData) {
  await mutate(
    formData,
    "hr.recruitment.write",
    (repository, context) =>
      repository.updateCombinedRole({
        ...context,
        combinedRoleId: value(formData, "combined_role_id"),
        name: value(formData, "name"),
        postIds: values(formData, "post_ids"),
        primaryPostId: value(formData, "primary_post_id"),
      }),
    "Combined role updated."
  )
}

export async function assignEmployeeAction(formData: FormData) {
  await mutate(formData, "hr.employees.write", (repository, context) =>
    repository.assignEmployee({
      ...context,
      employeeCode: value(formData, "employee_code"),
      employeeEvent: value(formData, "employee_event"),
      employeeName: value(formData, "employee_name"),
      lastWorkingDate: value(formData, "last_working_date"),
      postId: value(formData, "post_id"),
    })
  )
}

export async function bulkAssignEmployeesAction(formData: FormData) {
  const path = returnPath(formData)
  const session = await requireCapability("hr.employees.write", path)
  const file = formData.get("employee_assignments_file")
  if (!(file instanceof File) || file.size === 0) {
    redirect(
      `${path}&error=${encodeURIComponent("Select an employee assignment workbook.")}`
    )
  }
  if (!/\.(xlsx|xls)$/i.test(file.name)) {
    redirect(
      `${path}&error=${encodeURIComponent("Only XLSX or XLS files are accepted.")}`
    )
  }
  if (file.size > 5 * 1024 * 1024) {
    redirect(
      `${path}&error=${encodeURIComponent("The workbook must be 5 MB or smaller.")}`
    )
  }

  const repository = createRecruitmentRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  let outcome: { error?: string; success?: string }
  try {
    const organizationId = await repository.organizationIdForCode("MRMPL")
    const workbook = XLSX.read(Buffer.from(await file.arrayBuffer()), {
      type: "buffer",
    })
    const result = await repository.bulkAssignEmployees({
      actorUserId: session.user.id,
      assignments: parseEmployeeAssignmentWorkbook(workbook),
      organizationId,
    })
    outcome = {
      success: `Uploaded ${result.assignmentCount} assignments across ${result.updatedPostCount} approved posts.`,
    }
  } catch (error) {
    outcome = {
      error:
        error instanceof Error
          ? error.message
          : "The employee assignment workbook was not uploaded.",
    }
  } finally {
    await repository.close()
  }
  revalidatePath(hrPath)
  redirect(`${path}&${new URLSearchParams(outcome)}`)
}

export async function createJobAction(formData: FormData) {
  await mutate(formData, "hr.recruitment.write", (repository, context) =>
    repository.createJobFromPost({
      ...context,
      postId: value(formData, "post_id"),
      targetDate: value(formData, "target_date"),
    })
  )
}

export async function saveCandidateAction(formData: FormData) {
  const returnTo = returnPath(formData)
  const session = await requireCapability("hr.recruitment.write", returnTo)
  const repository = createRecruitmentRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  let outcome: { error?: string; success?: string }
  try {
    const organizationId = await repository.organizationIdForCode("MRMPL")
    const resume = formData.get("resume")
    let resumeData:
      | { bytes: Buffer; fileName: string; sourceId: string }
      | undefined
    if (resume instanceof File && resume.size > 0) {
      if (resume.size > 10 * 1024 * 1024) {
        throw new Error("Candidate resume must be 10 MB or smaller.")
      }
      if (!/\.pdf$/i.test(resume.name)) {
        throw new Error("Candidate resume must be a PDF file.")
      }
      const bytes = Buffer.from(await resume.arrayBuffer())
      if (bytes.subarray(0, 5).toString("ascii") !== "%PDF-") {
        throw new Error("Candidate resume is not a valid PDF file.")
      }
      resumeData = {
        bytes,
        fileName: resume.name.replace(/[<>:"/\\|?*]+/g, "_"),
        sourceId: randomUUID(),
      }
    }
    const candidate = await repository.upsertCandidate({
      actorUserId: session.user.id,
      candidateId: value(formData, "candidate_id"),
      currentCompany: value(formData, "current_company"),
      departmentCode: value(formData, "department_code"),
      email: value(formData, "email"),
      experience: value(formData, "experience"),
      name: value(formData, "name"),
      notes: value(formData, "notes"),
      organizationId,
      phone: value(formData, "phone"),
      source: value(formData, "source"),
    })
    if (resumeData) {
      const { bytes, fileName, sourceId } = resumeData
      const storageKey = nodePath.posix.join(
        "attachments",
        "candidate-resumes",
        candidate.id,
        sourceId,
        fileName
      )
      const storageRoot =
        process.env.LOCAL_FILE_STORAGE_PATH ??
        nodePath.join(/*turbopackIgnore: true*/ process.cwd(), "local-data")
      const filePath = nodePath.join(
        /*turbopackIgnore: true*/ storageRoot,
        ...storageKey.split("/")
      )
      await mkdir(nodePath.dirname(filePath), { recursive: true })
      await writeFile(filePath, bytes, { flag: "wx" })
      try {
        await repository.recordCandidateResume({
          actorUserId: session.user.id,
          byteSize: bytes.byteLength,
          candidateId: candidate.id,
          fileName,
          mediaType: "application/pdf",
          organizationId,
          sha256: createHash("sha256").update(bytes).digest("hex"),
          sourceId,
          storageKey,
        })
      } catch (error) {
        await unlink(filePath).catch(() => undefined)
        throw error
      }
    }
    outcome = { success: "Candidate saved successfully." }
  } catch (error) {
    outcome = {
      error:
        error instanceof Error ? error.message : "The candidate was not saved.",
    }
  } finally {
    await repository.close()
  }
  revalidatePath(hrPath)
  const feedback = new URLSearchParams(outcome)
  redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}${feedback}`)
}

export async function assignCandidateAction(formData: FormData) {
  await mutate(
    formData,
    "hr.recruitment.write",
    (repository, context) =>
      repository.assignCandidates({
        ...context,
        candidateIds: [
          ...values(formData, "candidate_ids"),
          ...values(formData, "candidate_id"),
        ],
        jobId: value(formData, "job_id"),
      }),
    "Selected candidates assigned to the job."
  )
}

export async function logCandidateEventAction(formData: FormData) {
  await mutate(formData, "hr.recruitment.write", (repository, context) =>
    repository.logCandidateEvent({
      ...context,
      candidateId: value(formData, "candidate_id"),
      eventType: value(formData, "event_type"),
      notes: value(formData, "notes"),
      title: value(formData, "title"),
    })
  )
}

export async function scheduleInterviewAction(formData: FormData) {
  await mutate(formData, "hr.recruitment.write", (repository, context) =>
    repository.scheduleInterview({
      ...context,
      applicationId: value(formData, "application_id"),
      interviewAt: value(formData, "interview_at"),
    })
  )
}

export async function recordInterviewAction(formData: FormData) {
  const roundName = value(formData, "round_name")
  const round = recruitmentInterviewRound(roundName)
  const questionScores = Object.fromEntries(
    (round?.questions ?? []).map((question) => [
      question.id,
      value(formData, `question_${question.id}`),
    ])
  )
  const selectedStatus = value(formData, "status")
  const status =
    selectedStatus === "Rejected" || selectedStatus === "Hold"
      ? selectedStatus
      : "Approved"
  await mutate(formData, "hr.recruitment.write", (repository, context) =>
    repository.recordInterview({
      ...context,
      applicationId: value(formData, "application_id"),
      comments: value(formData, "comments"),
      interviewerName: value(formData, "interviewer_name"),
      joiningDate: value(formData, "joining_date"),
      questionScores,
      roundName,
      status,
    })
  )
}
