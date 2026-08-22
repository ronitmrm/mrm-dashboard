"use server"

import { createHash, randomUUID } from "node:crypto"
import nodePath from "node:path"

import {
  createMasterDataLifecycleRepository,
  createRecruitmentRepository,
  type MasterDataKind,
  recruitmentInterviewRound,
} from "@workspace/db"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import * as XLSX from "xlsx"

import { parseEmployeeAssignmentWorkbook } from "@/app/hr/employee-assignment-workbook"
import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"
import { hrTaskCapabilities } from "@/lib/auth/task-capabilities"
import { hrReturnPath } from "@/lib/hr-return-path"
import { istDateTimeInputToIso } from "@/lib/date-time"
import {
  deleteUserAttachment,
  saveUserAttachment,
} from "@/lib/user-attachment-storage"

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

function interviewAtValue(formData: FormData) {
  const date = value(formData, "interview_date")
  const time = value(formData, "interview_time")
  return date && time
    ? istDateTimeInputToIso(`${date}T${time}`)
    : value(formData, "interview_at")
}

async function mutate(
  formData: FormData,
  capability: (typeof hrTaskCapabilities)[keyof typeof hrTaskCapabilities],
  operation: (
    repository: ReturnType<typeof createRecruitmentRepository>,
    context: { actorUserId: string; organizationId: string }
  ) => Promise<unknown>,
  successMessage = "Saved successfully.",
  successParams?: Record<string, string>
) {
  const path = hrReturnPath(formData)
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
  if (outcome.success && successParams) {
    for (const [key, value] of Object.entries(successParams)) {
      feedback.set(key, value)
    }
  }
  redirect(`${path}${path.includes("?") ? "&" : "?"}${feedback}`)
}

export async function saveMasterAction(formData: FormData) {
  await mutate(
    formData,
    hrTaskCapabilities.saveRecruitmentMaster,
    (repository, context) =>
      repository.upsertMaster({
        ...context,
        kind:
          value(formData, "kind") === "designation"
            ? "designation"
            : "department",
        name: value(formData, "name"),
      })
  )
}

export async function renameRecruitmentMasterAction(formData: FormData) {
  const kind =
    value(formData, "master_kind") === "designation"
      ? "designation"
      : "department"
  await mutate(
    formData,
    hrTaskCapabilities.renameRecruitmentMaster,
    (repository, context) =>
      kind === "designation"
        ? repository.renameDesignationMaster({
            ...context,
            designationId: value(formData, "master_id"),
            name: value(formData, "name"),
          })
        : repository.renameDepartmentMaster({
            ...context,
            departmentId: value(formData, "master_id"),
            name: value(formData, "name"),
            referenceMode: "propagate",
          }),
    `${kind === "designation" ? "Designation" : "Department"} renamed everywhere.`
  )
}

export async function deleteRecruitmentMasterAction(formData: FormData) {
  const path = hrReturnPath(formData)
  const session = await requireCapability(
    hrTaskCapabilities.deleteRecruitmentMaster,
    path
  )
  const connectionString = readAuthEnvironment().connectionString
  const recruitment = createRecruitmentRepository({ connectionString })
  const lifecycle = createMasterDataLifecycleRepository({ connectionString })
  const kind: MasterDataKind =
    value(formData, "master_kind") === "designation"
      ? "hr_designation"
      : value(formData, "master_kind") === "job_template"
        ? "hr_job_template"
        : "hr_department"
  let outcome: { error?: string; success?: string }
  try {
    const organizationId = await recruitment.organizationIdForCode("MRMPL")
    await lifecycle.deleteMaster({
      actorUserId: session.user.id,
      kind,
      organizationId,
      reason: value(formData, "deletion_reason"),
      recordId: value(formData, "master_id"),
      replacementRecordId: value(formData, "replacement_master_id") || null,
    })
    outcome = { success: "Master deleted successfully." }
  } catch (error) {
    outcome = {
      error: error instanceof Error ? error.message : "Master deletion failed.",
    }
  } finally {
    await lifecycle.close()
    await recruitment.close()
  }
  revalidatePath(hrPath)
  redirect(
    `${path}${path.includes("?") ? "&" : "?"}${new URLSearchParams(outcome)}`
  )
}

export async function saveTemplateAction(formData: FormData) {
  await mutate(
    formData,
    hrTaskCapabilities.saveTemplate,
    (repository, context) =>
      repository.upsertTemplate({
        ...context,
        combinedRoleId: value(formData, "combined_role_id"),
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
  await mutate(formData, hrTaskCapabilities.savePost, (repository, context) =>
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
    hrTaskCapabilities.updatePost,
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
    hrTaskCapabilities.deletePost,
    (repository, context) =>
      repository.deletePost({
        ...context,
        postId: value(formData, "post_id"),
      }),
    "Approved post deleted."
  )
}

export async function createCombinedRoleAction(formData: FormData) {
  await mutate(
    formData,
    hrTaskCapabilities.createCombinedRole,
    (repository, context) =>
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
    hrTaskCapabilities.updateCombinedRole,
    (repository, context) =>
      repository.updateCombinedRole({
        ...context,
        combinedRoleId: value(formData, "combined_role_id"),
        name: value(formData, "name"),
        postIds: values(formData, "post_ids"),
        primaryPostId: value(formData, "primary_post_id"),
        requirementTemplateCode: value(formData, "requirement_template_code"),
      }),
    "Combined role updated."
  )
}

export async function assignEmployeeAction(formData: FormData) {
  await mutate(
    formData,
    hrTaskCapabilities.assignEmployee,
    (repository, context) =>
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
  const path = hrReturnPath(formData)
  const session = await requireCapability(
    hrTaskCapabilities.bulkAssignEmployees,
    path
  )
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
  await mutate(formData, hrTaskCapabilities.createJob, (repository, context) =>
    repository.createJobFromPost({
      ...context,
      postId: value(formData, "post_id"),
      targetDate: value(formData, "target_date"),
    })
  )
}

export async function saveCandidateAction(formData: FormData) {
  const returnTo = hrReturnPath(formData)
  const session = await requireCapability(
    hrTaskCapabilities.saveCandidate,
    returnTo
  )
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
      designationCode: value(formData, "designation_code"),
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
      await saveUserAttachment({
        bytes,
        mediaType: "application/pdf",
        storageKey,
      })
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
        await deleteUserAttachment(storageKey).catch(() => undefined)
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
    hrTaskCapabilities.assignCandidate,
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

export async function completeCandidateAppointmentAction(formData: FormData) {
  await mutate(
    formData,
    hrTaskCapabilities.completeCandidateAppointment,
    (repository, context) =>
      repository.completeCandidateAppointment({
        ...context,
        applicationId: value(formData, "application_id"),
        joiningDate: value(formData, "joining_date"),
        salaryAfterProbationMaximum: value(
          formData,
          "salary_after_probation_maximum"
        ),
        salaryAfterProbationMinimum: value(
          formData,
          "salary_after_probation_minimum"
        ),
        salaryBeforeProbation: value(formData, "salary_before_probation"),
        willingToJoin: value(formData, "willing_to_join"),
      }),
    "Appointment details completed."
  )
}

export async function withdrawCandidateApplicationAction(formData: FormData) {
  await mutate(
    formData,
    hrTaskCapabilities.withdrawCandidateApplication,
    (repository, context) =>
      repository.withdrawCandidateApplication({
        ...context,
        applicationId: value(formData, "application_id"),
        reason: value(formData, "reason"),
      }),
    "Candidate withdrawal recorded in conversation history."
  )
}

export async function logCandidateEventAction(formData: FormData) {
  await mutate(
    formData,
    hrTaskCapabilities.logCandidateEvent,
    (repository, context) =>
      repository.logCandidateEvent({
        ...context,
        candidateId: value(formData, "candidate_id"),
        eventType: value(formData, "event_type"),
        notes: value(formData, "notes"),
        title: value(formData, "title"),
      })
  )
}

export async function updateCandidateEventAction(formData: FormData) {
  await mutate(
    formData,
    hrTaskCapabilities.updateCandidateEvent,
    (repository, context) =>
      repository.updateCandidateEvent({
        ...context,
        eventId: value(formData, "event_id"),
        eventType: value(formData, "event_type"),
        notes: value(formData, "notes"),
        title: value(formData, "title"),
      }),
    "Conversation log updated."
  )
}

export async function deleteCandidateEventAction(formData: FormData) {
  await mutate(
    formData,
    hrTaskCapabilities.deleteCandidateEvent,
    (repository, context) =>
      repository.deleteCandidateEvent({
        ...context,
        eventId: value(formData, "event_id"),
      }),
    "Conversation log deleted."
  )
}

export async function scheduleInterviewAction(formData: FormData) {
  await mutate(
    formData,
    hrTaskCapabilities.scheduleInterview,
    (repository, context) =>
      repository.scheduleInterview({
        ...context,
        applicationId: value(formData, "application_id"),
        interviewAt: interviewAtValue(formData),
        roundName: value(formData, "round_name"),
      })
  )
}

export async function recordInterviewAction(formData: FormData) {
  const applicationId = value(formData, "application_id")
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
  await mutate(
    formData,
    hrTaskCapabilities.recordInterview,
    (repository, context) =>
      repository.recordInterview({
        ...context,
        applicationId,
        comments: value(formData, "comments"),
        interviewerName: value(formData, "interviewer_name"),
        questionScores,
        roundName,
        status,
      }),
    "Interview outcome saved.",
    round?.name === "HR Round" && status === "Approved"
      ? { appointment: applicationId }
      : undefined
  )
}
