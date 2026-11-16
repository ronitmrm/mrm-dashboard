import { renderToStaticMarkup } from "react-dom/server"
import { expect, test, vi } from "vitest"
import type { RecruitmentEmployeeAssignmentRow, RecruitmentPostRow } from "@workspace/db"

vi.mock("@/lib/employee-handover-rows", () => import("../../lib/employee-handover-rows"))
import { SingleEmployeeAssignmentFields } from "./single-employee-assignment-fields"

const post: RecruitmentPostRow = {
    id: "post", postCode: "HR-AS-1", vacancyCode: "HR-AS-1", vacancyNumber: "1",
    department: "HR", departmentCode: "HR", designation: "Assistant",
    combinedRoleId: null, combinedRoleName: null, combinedVacancyCode: null,
    isPrimaryCombinedPost: false, requirementTemplateCode: null,
    employeeName: "Test Employee", employeeCode: "65", status: "Occupied",
    joiningDate: "2026-09-01", lastWorkingDate: null, joiningConfirmationDue: false,
  }
const assignment: RecruitmentEmployeeAssignmentRow = {
    id: "assignment", postCode: post.postCode, employeeName: "Test Employee", employeeCode: "65",
    department: "HR", designation: "Assistant", combinedVacancyCode: null,
    personalDetailsSaved: false, termDetailsSaved: false, employeePhone: null,
    joinedOn: post.joiningDate, probationDueOn: "2026-12-15", probationRemark: null,
    plannedEndOn: null, endedOn: null, exitType: null, exitNote: null,
    legacyProbationCompleted: false, legacyProbationRecordedOn: null,
    appointmentLetterIssuedOn: null, offerLetterId: null, offerLetterReference: null,
  }
test("prefills the probation end date saved when the employee joined", () => {
  const html = renderToStaticMarkup(<SingleEmployeeAssignmentFields
    allowIdentityCorrection combinedRoles={[]} employeeAssignments={[assignment]}
    initialPostId={post.id} posts={[post]} showTargetSelector={false} />)
  expect(html).toMatch(/name="probation_due_on"[^>]*value="2026-12-15"/)
  expect(html).toContain('value="Designation Corrected"')
  expect(html).toContain('value="Transferred"')
  expect(html).toMatch(/value="Appointed"[^>]*disabled/)
  expect(html).toContain('value="Resigned Without Process"')
  expect(html).not.toContain('value="Removed"')
  expect(html).not.toContain("Remove Assignment")
})

test("offers resignation withdrawal for the retained employee and shows the history", () => {
  const resigned = { ...post, status: "Resigned", employeeName: null, employeeCode: null, lastWorkingDate: "2099-09-15" }
  const history: RecruitmentEmployeeAssignmentRow["resignationHistory"] = [
    { type: "Resigned", recordedAt: "2026-09-01T10:00:00Z", lastWorkingDate: "2026-09-15", note: null },
    { type: "Resignation Withdrawn", recordedAt: "2026-09-02T10:00:00Z", lastWorkingDate: "2026-09-15", note: "Employee agreed to continue" },
  ]
  const html = renderToStaticMarkup(<SingleEmployeeAssignmentFields
    allowIdentityCorrection combinedRoles={[]} employeeAssignments={[{ ...assignment, resignationHistory: history }]}
    initialPostId={post.id} posts={[resigned]} showTargetSelector={false} />)
  expect(html).toContain('value="Resignation Withdrawn"')
  expect(html).toContain('value="Joined">Joined</option>')
  expect(html).not.toMatch(/value="Joined"[^>]*disabled/)
  expect(html).toMatch(/name="employee_name"[^>]*value="Test Employee"/)
  expect(html).toContain("Employee agreed to continue")
  expect(html).toContain("15/09/2026")
  const pastHtml = renderToStaticMarkup(<SingleEmployeeAssignmentFields
    allowIdentityCorrection combinedRoles={[]} employeeAssignments={[assignment]}
    initialPostId={post.id} posts={[{ ...resigned, lastWorkingDate: "2000-01-01" }]} showTargetSelector={false} />)
  expect(pastHtml).not.toContain('value="Resignation Withdrawn"')
})

test.each([false, true])("uses shared action labels when replacement pending is %s", (pending) => {
  const target: RecruitmentPostRow = pending ? {
    ...post,
    status: "Resigned",
    lastWorkingDate: "2099-09-15",
    replacementAppointments: [{
      id: "replacement", employeeName: "Incoming Employee", employeeCode: "66",
      status: "Pending", appointedAt: "2026-09-01T10:00:00Z", completedAt: null,
      outgoingEmployeeName: post.employeeName, outgoingEmployeeCode: post.employeeCode,
      outgoingLastWorkingDate: "2099-09-15",
    }],
  } : { ...post, status: "Appointed", joiningConfirmationDue: true }
  const html = renderToStaticMarkup(<SingleEmployeeAssignmentFields
    combinedRoles={[]} initialPostId={post.id} posts={[target]} showTargetSelector={false} />)
  expect(html).toContain(`value="${pending ? "Replacement Joined" : "Joined"}">Joined</option>`)
  expect(html).toContain(`value="${pending ? "Cancel Replacement" : "Removed"}">Cancel Appointment</option>`)
  expect(html.match(/>Joined<\/option>/g)).toHaveLength(1)
  expect(html.match(/>Cancel Appointment<\/option>/g)).toHaveLength(1)
})
