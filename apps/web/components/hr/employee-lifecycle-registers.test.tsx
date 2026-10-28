import { renderToStaticMarkup } from "react-dom/server"
import { expect, test, vi } from "vitest"
import type { RecruitmentEmployeeAssignmentRow } from "@workspace/db"

vi.mock("@/app/hr/actions", () => ({ updateEmployeeProbationAction: vi.fn() }))
vi.mock("@/components/attachment-viewer-link", () => ({ AttachmentViewerLink: () => null }))
vi.mock("@/components/hr/employee-letter-dialog", () => ({ EmployeeLetterForm: () => null }))
vi.mock("@/components/hr/employee-appointment-letters", () => ({ EmployeeAppointmentLetters: () => null }))
vi.mock("@/lib/date-time", () => import("../../lib/date-time"))
vi.mock("@/lib/hr/probation-reminder", () => import("../../lib/hr/probation-reminder"))
vi.mock("@/components/ui/golden-patterns", () => import("../ui/golden-patterns"))

import { EmployeeAssignmentHistory } from "./employee-lifecycle-registers"

test("shows the resignation and its cancellation as separate history rows without a popup", () => {
  const assignment: RecruitmentEmployeeAssignmentRow = {
    id: "assignment", postCode: "HR-AS-1", employeeName: "Test Employee", employeeCode: "65",
    department: "HR", designation: "Assistant", combinedVacancyCode: null,
    personalDetailsSaved: false, termDetailsSaved: false, employeePhone: null,
    joinedOn: "2026-09-01", probationDueOn: "2026-11-01", probationRemark: null,
    plannedEndOn: null, endedOn: null, exitType: null, exitNote: null,
    legacyProbationCompleted: false, legacyProbationRecordedOn: null,
    appointmentLetterIssuedOn: null, offerLetterId: null, offerLetterReference: null,
    probationHistory: [
      { recordedAt: "2026-10-03T10:00:00Z", previousDueOn: "2026-10-01", nextDueOn: "2026-11-01", note: "Needs another month of supervised work" },
    ],
    resignationHistory: [
      { type: "Resigned", recordedAt: "2026-10-01T10:00:00Z", lastWorkingDate: "2026-10-31", note: "Leaving for another role" },
      { type: "Resignation Withdrawn", recordedAt: "2026-10-02T10:00:00Z", lastWorkingDate: "2026-10-31", note: "Employee agreed to continue" },
    ],
  }
  const html = renderToStaticMarkup(<EmployeeAssignmentHistory assignments={[assignment]} />)
  const rows = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/)?.[1]?.match(/<tr\b[\s\S]*?<\/tr>/g)
  expect(rows).toHaveLength(4)
  expect(rows?.[0]).toContain('data-filter-value="Current"')
  expect(rows?.[1]).toContain('data-filter-value="Resigned"')
  expect(rows?.[1]).toContain("Leaving for another role")
  expect(rows?.[2]).toContain('data-filter-value="Resignation Cancelled"')
  expect(rows?.[2]).toContain("02/10/2026, 15:30 IST")
  expect(rows?.[2]).toContain("31/10/2026")
  expect(rows?.[2]).toContain("Employee agreed to continue")
  expect(rows?.[3]).toContain('data-filter-value="Probation Extended"')
  expect(rows?.[3]).toContain("01/10/2026")
  expect(rows?.[3]).toContain("01/11/2026")
  expect(rows?.[3]).toContain("Needs another month of supervised work")
  expect(rows?.[3]).toContain("03/10/2026, 15:30 IST")
  expect(html).not.toContain("View History")
  expect(html).not.toContain(">Resignation History<")
})
