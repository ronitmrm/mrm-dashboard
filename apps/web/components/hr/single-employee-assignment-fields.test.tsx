import { renderToStaticMarkup } from "react-dom/server"
import { expect, test, vi } from "vitest"
import type { RecruitmentEmployeeAssignmentRow, RecruitmentPostRow } from "@workspace/db"

vi.mock("@/lib/employee-handover-rows", () => import("../../lib/employee-handover-rows"))
import { SingleEmployeeAssignmentFields } from "./single-employee-assignment-fields"

test("prefills the probation end date saved when the employee joined", () => {
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
  const html = renderToStaticMarkup(<SingleEmployeeAssignmentFields
    allowIdentityCorrection combinedRoles={[]} employeeAssignments={[assignment]}
    initialPostId={post.id} posts={[post]} showTargetSelector={false} />)
  expect(html).toMatch(/name="probation_due_on"[^>]*value="2026-12-15"/)
})
