import { renderToStaticMarkup } from "react-dom/server"
import { expect, test, vi } from "vitest"
import type { RecruitmentInterviewRow } from "@workspace/db"

vi.mock("@/app/hr/actions", () => ({ scheduleInterviewAction: vi.fn() }))
vi.mock("@/components/hr/candidate-appointment-dialog", () => ({ CandidateAppointmentDialog: () => null }))
vi.mock("@/components/hr/candidate-application-actions", () => ({ CandidateApplicationActions: () => null }))
vi.mock("@/components/hr/job-template-preview", () => ({ JobTemplatePreviewLink: () => null }))
vi.mock("@/components/hr/interview-reschedule-dialog", () => import("./interview-reschedule-dialog"))
vi.mock("@/components/ui/golden-patterns", () => ({ MetricSummary: () => null, StandardDialogContent: () => null }))
vi.mock("@/lib/date-time", () => import("../../lib/date-time"))

import { InterviewScheduleBoard } from "./interview-workspace"

const scheduled: RecruitmentInterviewRow = {
  applicationId: "scheduled", candidateId: "candidate", candidateName: "Scheduled Candidate",
  interviewAt: "2026-10-21T05:00:00.000Z", jobId: "job", jobNumber: "JOB-1",
  requirementTemplateCode: null, joiningDate: null, jobTitle: "Assistant",
  latestRound: "Screening Round", latestStatus: "Scheduled", nextRound: "Screening Round",
  plannedRound: "Screening Round", postCode: null, scoreableRound: "Screening Round", status: "Interview",
}

test("offers rescheduling for the pending interview only", () => {
  const html = renderToStaticMarkup(<InterviewScheduleBoard canSchedule canWrite={false} interviews={[
    scheduled,
    { ...scheduled, applicationId: "awaiting", candidateName: "Awaiting Candidate", interviewAt: null,
      latestStatus: null, scoreableRound: null, status: "Assigned" },
  ]} />)
  expect(html.match(/Reschedule<\/button>/g)).toHaveLength(1)
  expect(html).toContain("Scheduled Candidate")
  expect(html).not.toContain("Awaiting Candidate")
})

test("hides rescheduling without scheduling permission even when other HR actions are allowed", () => {
  const html = renderToStaticMarkup(<InterviewScheduleBoard canSchedule={false} canWrite interviews={[scheduled]} />)
  expect(html).toContain("Record Outcome")
  expect(html).not.toContain("Reschedule")
})
