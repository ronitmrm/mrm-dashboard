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
