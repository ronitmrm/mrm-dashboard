import { renderToStaticMarkup } from "react-dom/server"
import { expect, test, vi } from "vitest"
import type { RecruitmentPostRow } from "@workspace/db"

vi.mock("@/app/hr/actions", () => ({ assignEmployeeAction: vi.fn(), createJobAction: vi.fn(), deletePostAction: vi.fn(), updatePostAction: vi.fn() }))
vi.mock("@/components/attachment-viewer-link", () => ({ AttachmentViewerLink: () => null }))
vi.mock("@/components/hr/approved-post-filter-columns", () => import("./approved-post-filter-columns"))
vi.mock("@/components/hr/single-employee-assignment-fields", () => ({ SingleEmployeeAssignmentFields: () => null }))
vi.mock("@/components/hr/employee-letter-dialog", () => ({ EmployeeLetterDialog: () => null }))
vi.mock("@/components/hr/employee-appointment-letters", () => ({ EmployeeAppointmentLetters: () => null }))
vi.mock("@/components/hr/job-template-preview", () => ({ JobTemplatePreviewLink: () => null }))
vi.mock("@/components/ui/golden-patterns", () => ({ MetricSummary: () => null, StandardDialogContent: () => null }))
vi.mock("@/lib/employee-handover-rows", () => import("../../lib/employee-handover-rows"))
vi.mock("@/components/hr/candidate-application-actions", () => ({
  CandidateApplicationActions: ({ applicationId, canRecordDidNotJoin, panelId, masterView }: {
    applicationId: string; canRecordDidNotJoin?: boolean; panelId?: string; masterView?: string
  }) => canRecordDidNotJoin ? <button data-application={applicationId} data-panel={panelId} data-view={masterView}>Did Not Join</button> : null,
}))

import { ApprovedPostsTable } from "./approved-posts-table"

const appointed: RecruitmentPostRow = {
  id: "appointed", postCode: "HR-AS-1", vacancyCode: "HR-AS-1", vacancyNumber: "1",
  department: "HR", departmentCode: "HR", designation: "Assistant",
  combinedRoleId: null, combinedRoleName: null, combinedVacancyCode: null,
  isPrimaryCombinedPost: false, requirementTemplateCode: null,
  employeeName: "Candidate", employeeCode: null, status: "Appointed",
  appointedApplicationId: "normal-application", joiningDate: "2026-01-01",
  lastWorkingDate: null, joiningConfirmationDue: true,
}
const posts: RecruitmentPostRow[] = [
  appointed,
  { ...appointed, id: "manual", appointedApplicationId: null },
  { ...appointed, id: "joined", status: "Occupied", employeeCode: "100", appointedApplicationId: "joined-application" },
  { ...appointed, id: "outgoing", status: "Resigned", employeeCode: "101", appointedApplicationId: null,
    replacementAppointments: [{
      id: "replacement", applicationId: "replacement-application", employeeName: "Replacement",
      employeeCode: "102", status: "Pending", appointedAt: "2025-12-01", joiningDate: "2026-01-01",
      completedAt: null, outgoingEmployeeName: "Outgoing", outgoingEmployeeCode: "101", outgoingLastWorkingDate: "2026-01-31",
    }],
  },
]

test("offers Did Not Join for candidate appointments and pending replacements in Employee Master", () => {
  const html = renderToStaticMarkup(<ApprovedPostsTable employeeView canRecordDidNotJoin masterView="masterTables" posts={posts} />)
  expect(html.match(/>Did Not Join<\/button>/g)).toHaveLength(2)
  expect(html).toContain('data-application="normal-application" data-panel="employeeMasterPanel" data-view="masterTables"')
  expect(html).toContain('data-application="replacement-application" data-panel="employeeMasterPanel" data-view="masterTables"')
  expect(html).not.toContain('data-application="joined-application"')
})

test("hides Did Not Join without appointment permission", () => {
  const html = renderToStaticMarkup(<ApprovedPostsTable employeeView employeeManagement posts={posts} />)
  expect(html).not.toContain(">Did Not Join</button>")
})
