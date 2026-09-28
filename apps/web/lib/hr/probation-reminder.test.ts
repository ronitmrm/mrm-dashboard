import { expect, test } from "vitest"

import { probationReminderStatus, splitProbationAssignments } from "./probation-reminder"

test("marks an asserted legacy probation complete without treating every past date as complete", () => {
  const assignment = {
    appointmentLetterIssuedOn: null,
    legacyProbationCompleted: true,
    probationDueOn: "2026-09-01",
  }
  expect(probationReminderStatus(assignment, "2026-09-27", "2026-10-27")).toBe("Completed")
  expect(probationReminderStatus({ ...assignment, legacyProbationCompleted: false }, "2026-09-27", "2026-10-27")).toBe("Due")
})

test("keeps completed assignments in the log and out of open tasks", () => {
  const assignments = [
    { id: "legacy", appointmentLetterIssuedOn: null, legacyProbationCompleted: true, probationDueOn: "2026-09-01", endedOn: "2026-09-20" },
    { id: "future", appointmentLetterIssuedOn: null, legacyProbationCompleted: false, probationDueOn: "2026-10-10", endedOn: null },
  ]
  const { open, completed } = splitProbationAssignments(assignments, "2026-09-27", "2026-10-27")
  expect(open.map(({ id }) => id)).toEqual(["future"])
  expect(completed.map(({ id }) => id)).toEqual(["legacy"])
})

test("closes an incomplete probation task on the employee's actual departure date", () => {
  const assignments = [
    { id: "departed-today", appointmentLetterIssuedOn: null, legacyProbationCompleted: false, probationDueOn: "2026-10-10", endedOn: "2026-09-27" },
    { id: "still-employed", appointmentLetterIssuedOn: null, legacyProbationCompleted: false, probationDueOn: "2026-10-10", endedOn: null },
  ]
  const { open, completed } = splitProbationAssignments(assignments, "2026-09-27", "2026-10-27")
  expect(open.map(({ id }) => id)).toEqual(["still-employed"])
  expect(completed).toEqual([])
})
