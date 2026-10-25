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
})

test("offers resignation withdrawal for the retained employee and shows the history", () => {
  const resigned = { ...post, status: "Resigned", employeeName: null, employeeCode: null, lastWorkingDate: "2026-09-15" }
  const history: RecruitmentEmployeeAssignmentRow["resignationHistory"] = [
    { type: "Resigned", recordedAt: "2026-09-01T10:00:00Z", lastWorkingDate: "2026-09-15", note: null },
    { type: "Resignation Withdrawn", recordedAt: "2026-09-02T10:00:00Z", lastWorkingDate: "2026-09-15", note: "Employee agreed to continue" },
  ]
  const html = renderToStaticMarkup(<SingleEmployeeAssignmentFields
    allowIdentityCorrection combinedRoles={[]} employeeAssignments={[{ ...assignment, resignationHistory: history }]}
    initialPostId={post.id} posts={[resigned]} showTargetSelector={false} />)
  expect(html).toContain('value="Resignation Withdrawn"')
  expect(html).toMatch(/name="employee_name"[^>]*value="Test Employee"/)
  expect(html).toContain("Employee agreed to continue")
  expect(html).toContain("15/09/2026")
})
