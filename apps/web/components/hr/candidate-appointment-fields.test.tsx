import { renderToStaticMarkup } from "react-dom/server"
import { expect, test } from "vitest"

import { CandidateAppointmentFields } from "./candidate-appointment-fields"

test("reappointment without an earlier offer collects a new date and retained salary terms", () => {
  const html = renderToStaticMarkup(<CandidateAppointmentFields
    defaults={{ salaryBeforeProbation: 15000, salaryAfterProbationMinimum: 18000, salaryAfterProbationMaximum: 20000 }}
    includeOfferDetails={false} minimumJoiningDate="2026-10-25" />)
  expect(html).toContain('name="joining_date"')
  expect(html).toMatch(/name="salary_before_probation"[^>]*value="15000"/)
  expect(html).not.toContain('name="offer_issued_on"')
})
