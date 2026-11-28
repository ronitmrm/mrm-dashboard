import type { RecruitmentEmployeeAssignmentRow } from "@workspace/db"

type ReminderAssignment = Pick<
  RecruitmentEmployeeAssignmentRow,
  "appointmentLetterIssuedOn" | "exitType" | "legacyProbationCompleted" | "probationDueOn"
>

export function probationReminderStatus(
  assignment: ReminderAssignment,
  today: string,
  approachingOn: string
) {
  if (assignment.appointmentLetterIssuedOn || assignment.legacyProbationCompleted) return "Completed"
  if (assignment.exitType === "Probation Not Confirmed") return "Not Confirmed"
  if (!assignment.probationDueOn) return "Date Needed"
  if (assignment.probationDueOn <= today) return "Due"
  if (assignment.probationDueOn <= approachingOn) return "Approaching"
  return "Scheduled"
}

export function splitProbationAssignments<
  T extends ReminderAssignment & { endedOn: string | null },
>(assignments: readonly T[], today: string, approachingOn: string) {
  const open: T[] = []
  const completed: T[] = []
  for (const assignment of assignments) {
    const status = probationReminderStatus(assignment, today, approachingOn)
    if (status === "Completed" || status === "Not Confirmed") {
      completed.push(assignment)
    } else if (!assignment.endedOn || assignment.endedOn > today) {
      open.push(assignment)
    }
  }
  return { open, completed }
}
