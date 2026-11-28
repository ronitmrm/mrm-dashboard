import { expect, test } from "vitest"

import { probationReminderStatus, splitProbationAssignments } from "./probation-reminder"

test("marks an asserted legacy probation complete without treating every past date as complete", () => {
  const assignment = {
    appointmentLetterIssuedOn: null,
    exitType: null,
    legacyProbationCompleted: true,
    probationDueOn: "2026-09-01",
  }
  expect(probationReminderStatus(assignment, "2026-09-27", "2026-10-27")).toBe("Completed")
  expect(probationReminderStatus({ ...assignment, legacyProbationCompleted: false }, "2026-09-27", "2026-10-27")).toBe("Due")
})

test("keeps completed assignments in the log and out of open tasks", () => {
  const assignments = [
    { id: "legacy", appointmentLetterIssuedOn: null, exitType: null, legacyProbationCompleted: true, probationDueOn: "2026-09-01", endedOn: "2026-09-20" },
    { id: "future", appointmentLetterIssuedOn: null, exitType: null, legacyProbationCompleted: false, probationDueOn: "2026-10-10", endedOn: null },
    { id: "relieved", appointmentLetterIssuedOn: null, exitType: "Probation Not Confirmed", legacyProbationCompleted: false, probationDueOn: "2026-09-01", endedOn: null },
  ]
  const { open, completed } = splitProbationAssignments(assignments, "2026-09-27", "2026-10-27")
  expect(open.map(({ id }) => id)).toEqual(["future"])
  expect(completed.map(({ id }) => id)).toEqual(["legacy", "relieved"])
})

test("closes an incomplete probation task on the employee's actual departure date", () => {
  const assignments = [
    { id: "departed-today", appointmentLetterIssuedOn: null, exitType: null, legacyProbationCompleted: false, probationDueOn: "2026-10-10", endedOn: "2026-09-27" },
    { id: "still-employed", appointmentLetterIssuedOn: null, exitType: null, legacyProbationCompleted: false, probationDueOn: "2026-10-10", endedOn: null },
    { id: "left-without-process", appointmentLetterIssuedOn: null, exitType: "Left Without Process", legacyProbationCompleted: false, probationDueOn: "2026-10-10", endedOn: null, plannedEndOn: "2026-09-20" },
    { id: "serving-notice", appointmentLetterIssuedOn: null, exitType: "Resigned", legacyProbationCompleted: false, probationDueOn: "2026-10-10", endedOn: null, plannedEndOn: "2026-10-05" },
  ]
  const { open, completed } = splitProbationAssignments(assignments, "2026-09-27", "2026-10-27")
  expect(open.map(({ id }) => id)).toEqual(["still-employed", "serving-notice"])
  expect(completed).toEqual([])
})
