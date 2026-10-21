import type { RecruitmentEmployeeAssignmentRow, RecruitmentEmploymentLetterRow, RecruitmentPostRow } from "@workspace/db"

export function employeeLettersForPost<T extends Pick<RecruitmentEmploymentLetterRow,
  "applicationId" | "employeeCode" | "employeeName" | "joiningDate" | "letterType" | "postId"
>>(
  post: Pick<RecruitmentPostRow, "appointedApplicationId" | "employeeCode" | "employeeName" | "id" | "joiningDate" | "status"> | null,
  letters: T[]
) {
  if (!post || !["Appointed", "Occupied", "Resigned"].includes(post.status)) return []
  const employeeCode = post.employeeCode?.trim().toLowerCase()
  return letters.filter((letter) => {
    if (letter.letterType === "offer" && post.appointedApplicationId) {
      return letter.applicationId === post.appointedApplicationId
    }
    if (!post.joiningDate || letter.joiningDate !== post.joiningDate) return false
    if (employeeCode && letter.employeeCode) {
      return letter.employeeCode.trim().toLowerCase() === employeeCode
    }
    return letter.postId === post.id && Boolean(post.employeeName?.trim()) &&
      letter.employeeName.trim().toLowerCase() === post.employeeName?.trim().toLowerCase()
  })
}

export function employeeAssignmentForPost<T extends Pick<
  RecruitmentEmployeeAssignmentRow, "employeeCode" | "endedOn" | "joinedOn" | "postCode"
>>(
  post: Pick<RecruitmentPostRow, "employeeCode" | "joiningDate" | "lastWorkingDate" | "postCode" | "status">,
  assignments: T[]
) {
  if (!post.employeeCode || !["Occupied", "Resigned"].includes(post.status)) return undefined
  const matching = assignments.filter((assignment) => assignment.postCode === post.postCode &&
    assignment.employeeCode === post.employeeCode)
  const outgoing = post.status === "Resigned" ? matching.find((assignment) =>
    assignment.joinedOn === post.joiningDate && assignment.endedOn === post.lastWorkingDate) : undefined
  return outgoing ?? matching.find((assignment) => assignment.endedOn === null)
}

export function employeeHandoverRows(
  posts: RecruitmentPostRow[]
): (RecruitmentPostRow & { sourcePostId?: string })[] {
  return posts.flatMap((post) => [
    post,
    ...(post.replacementAppointments ?? []).flatMap<RecruitmentPostRow & { sourcePostId?: string }>((replacement) =>
      replacement.status === "Pending"
        ? [{
            ...post,
            id: `pending:${replacement.id}`,
            sourcePostId: post.id,
            appointedApplicationId: replacement.applicationId ?? null,
            employeeName: replacement.employeeName,
            employeeCode: replacement.employeeCode,
            joiningDate: replacement.joiningDate ?? null,
            lastWorkingDate: null,
            status: "Appointed",
            joiningConfirmationDue: false,
            replacementAppointments: [],
          }]
        : replacement.status === "Joined" && replacement.outgoingStillEmployed
        ? [{
            ...post,
            id: `outgoing:${replacement.id}`,
            appointedApplicationId: null,
            employeeName: replacement.outgoingEmployeeName,
            employeeCode: replacement.outgoingEmployeeCode,
            joiningDate: replacement.outgoingJoiningDate ?? null,
            lastWorkingDate: replacement.outgoingLastWorkingDate,
            status: "Resigned",
            joiningConfirmationDue: false,
            replacementAppointments: [],
          }]
        : []
    ),
  ])
}
