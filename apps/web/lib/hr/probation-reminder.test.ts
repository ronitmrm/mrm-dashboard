import { expect, test } from "vitest"

import { probationReminderStatus } from "./probation-reminder"

test("marks an asserted legacy probation complete without treating every past date as complete", () => {
  const assignment = {
    appointmentLetterIssuedOn: null,
    legacyProbationCompleted: true,
    probationDueOn: "2026-09-01",
  }
  expect(probationReminderStatus(assignment, "2026-09-27", "2026-10-27")).toBe("Completed")
  expect(probationReminderStatus({ ...assignment, legacyProbationCompleted: false }, "2026-09-27", "2026-10-27")).toBe("Due")
})
