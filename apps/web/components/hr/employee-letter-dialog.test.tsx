import { renderToStaticMarkup } from "react-dom/server"
import { expect, test, vi } from "vitest"
import type { RecruitmentEmploymentLetterRow } from "@workspace/db"

vi.mock("@/app/hr/actions", () => ({
  generateEmploymentLetterAction: vi.fn(),
  reviseAppointmentLetterAction: vi.fn(),
}))
vi.mock(
  "@/components/ui/golden-patterns",
  () => import("../ui/golden-patterns")
)

import { EmployeeLetterForm } from "./employee-letter-dialog"
import { EmployeeAppointmentLetters } from "./employee-appointment-letters"

test("carries the saved probation date into the letter form and returns to HR Tasks", () => {
  const html = renderToStaticMarkup(
    <EmployeeLetterForm
      post={{
        id: "current-post",
        employeeName: "Test Employee",
        employeeCode: "100",
        designation: "Assistant",
      }}
      probationCompletedOn="2026-10-08"
      returnPanel="probationRemindersPanel"
      type="appointment"
    />
  )

  expect(html).toContain('name="panel" value="probationRemindersPanel"')
  expect(html).toContain('name="post_id" value="current-post"')
  expect(html).toMatch(/name="probation_completed_on"[^>]*value="2026-10-08"/)
  expect(html).toContain('name="postal_address"')
  expect(html).toContain('name="probation_length"')
  expect(html).toContain('name="probation_unit"')
  expect(html).toContain('name="duty_start_time"')
  expect(html).toContain('name="duty_end_time"')
  expect(html).toMatch(/name="minimum_weekly_hours"[^>]*value="60"/)
  expect(html).toContain("Generate And Store Letter")
})

const appointmentLetter: RecruitmentEmploymentLetterRow = {
  applicationId: null,
  department: "Operations / Planning",
  designation: "Supervisor (Operations) / Planner (Planning)",
  details: {
    confirmationEffectiveDate: "2026-10-01",
    dutyStartTime: "09:15",
    dutyEndTime: "18:45",
    grossMonthlySalary: 30000,
    minimumWeeklyHours: 54,
    postalAddress: "42 Test Road\nJamnagar",
    probationCompletedOn: "2026-09-30",
    probationLength: 3,
    probationUnit: "months",
    reportsTo: "Test Manager",
    signatoryDesignation: "HR Manager",
    signatoryName: "Test Signatory",
    workLocation: "Jamnagar",
  },
  employeeCode: "100",
  employeeName: "Test Employee",
  fileAvailable: true,
  id: "current-letter",
  issuedOn: "2026-10-02",
  joiningDate: "2026-07-01",
  lastWorkingDate: null,
  letterType: "appointment",
  postCode: "CMB-8",
  postId: "original-post",
  referenceNumber: "AL2",
  supersedesLetterId: "previous-letter",
}

test("prefills an existing appointment and offers revision while retaining the previous PDF", () => {
  const html = renderToStaticMarkup(
    <EmployeeLetterForm appointmentLetter={appointmentLetter} returnPanel="probationRemindersPanel" type="appointment" />
  )
  expect(html).toContain('name="previous_letter_id" value="current-letter"')
  expect(html).not.toContain('name="post_id"')
  expect(html).toMatch(/name="letter_issued_on"[^>]*value="2026-10-02"/)
  expect(html).toContain("42 Test Road\nJamnagar")
  expect(html).toMatch(/name="gross_monthly_salary"[^>]*value="30000"/)
  expect(html).toMatch(/name="minimum_weekly_hours"[^>]*value="54"/)
  expect(html).toMatch(/name="duty_start_time"[^>]*value="09:15"/)
  expect(html).toMatch(/name="reason" required=""/)
  expect(html).toContain("Save &amp; Regenerate Appointment Letter")

  const history = renderToStaticMarkup(
    <EmployeeAppointmentLetters
      canEdit
      employeeCode=" 100 "
      joiningDate="2026-07-01"
      letters={[
        appointmentLetter,
        { ...appointmentLetter, id: "previous-letter", referenceNumber: "AL1", supersedesLetterId: null },
        { ...appointmentLetter, id: "unrelated", employeeCode: "101", referenceNumber: "AL3" },
      ]}
    />
  )
  expect(history).toContain("Appointment · AL2")
  expect(history).toContain("Appointment · AL1 (Previous)")
  expect(history).toContain("Edit &amp; Regenerate")
  expect(history).not.toContain("AL3")
})

test("requires missing legacy appointment fields instead of inventing their values", () => {
  const html = renderToStaticMarkup(
    <EmployeeLetterForm appointmentLetter={{ ...appointmentLetter, details: { grossMonthlySalary: 24000, reportsTo: "Saved Manager" } }} type="appointment" />
  )
  expect(html).toMatch(/name="postal_address"[^>]*required=""[^>]*><\/textarea>/)
  expect(html).toMatch(/required=""[^>]*name="probation_length"[^>]*value=""/)
  expect(html).toMatch(/<option[^>]*value="" selected="">Select Unit<\/option>/)
  expect(html).toMatch(/required=""[^>]*name="minimum_weekly_hours"[^>]*value=""/)
  expect(html).toMatch(/name="gross_monthly_salary"[^>]*value="24000"/)
  expect(html).toMatch(/name="reports_to"[^>]*value="Saved Manager"/)
})
