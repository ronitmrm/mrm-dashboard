import type { RecruitmentPostRow } from "@workspace/db"

export function employeeHandoverRows(posts: RecruitmentPostRow[]) {
  return posts.flatMap((post) => [
    post,
    ...(post.replacementAppointments ?? []).flatMap((replacement) =>
      replacement.status === "Pending"
        ? [{
            ...post,
            id: `pending:${replacement.id}`,
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
