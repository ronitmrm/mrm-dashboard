import type { RecruitmentEmployeeAssignmentRow } from "@workspace/db"

type ReminderAssignment = Pick<
  RecruitmentEmployeeAssignmentRow,
  "appointmentLetterIssuedOn" | "legacyProbationCompleted" | "probationDueOn"
>

export function probationReminderStatus(
  assignment: ReminderAssignment,
  today: string,
  approachingOn: string
) {
  if (assignment.appointmentLetterIssuedOn || assignment.legacyProbationCompleted) return "Completed"
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
    if (probationReminderStatus(assignment, today, approachingOn) === "Completed") {
      completed.push(assignment)
    } else if (!assignment.endedOn || assignment.endedOn >= today) {
      open.push(assignment)
    }
  }
  return { open, completed }
}
