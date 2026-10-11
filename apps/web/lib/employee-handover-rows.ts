import type { RecruitmentEmployeeAssignmentRow, RecruitmentPostRow } from "@workspace/db"

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
    ...(post.replacementAppointments ?? []).flatMap((replacement) =>
      replacement.status === "Pending"
        ? [{
            ...post,
            id: `pending:${replacement.id}`,
            sourcePostId: post.id,
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
