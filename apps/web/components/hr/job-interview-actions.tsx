"use client"

import type { RecruitmentJobApplicationRow, RecruitmentJobRow } from "@workspace/db"
import { Button } from "@workspace/ui/components/button"
import { Dialog, DialogTrigger } from "@workspace/ui/components/dialog"

import { InterviewOutcomeForm } from "@/components/hr/interview-outcome-form"
import { InterviewScoringLayout } from "@/components/hr/interview-scoring-layout"
import { JobInterviewScheduleForm } from "@/components/hr/interview-schedule-form"
import { StandardDialogContent } from "@/components/ui/golden-patterns"

export function JobInterviewActions({
  applications,
  interviewerOptions,
  job,
}: {
  applications: RecruitmentJobApplicationRow[]
  interviewerOptions: Array<{ code: string; name: string }>
  job: RecruitmentJobRow
}) {
  const scoreableApplications = applications.filter((application) => application.scoreableRound !== null)

  return (
    <section aria-label="Interview actions" className="flex flex-wrap gap-3">
      <Dialog>
        <DialogTrigger asChild>
          <Button type="button" variant="outline">Schedule Interview</Button>
        </DialogTrigger>
        <StandardDialogContent
          className="max-w-3xl"
          description="Select An Assigned Candidate And Confirm The Required Next Round."
          title="Schedule Interview"
        >
          <JobInterviewScheduleForm applications={applications} job={job} />
        </StandardDialogContent>
      </Dialog>

      <Dialog>
        <DialogTrigger asChild>
          <Button type="button">Record Interview Outcome</Button>
        </DialogTrigger>
        <StandardDialogContent
          className="max-w-6xl"
          description="Complete Every Preset Question To Save A Unified Assessment."
          title="Record Interview Outcome"
        >
          <InterviewScoringLayout templateCode={job.requirementTemplateCode}>
            <InterviewOutcomeForm
              applications={applications.map((application) => ({
                candidateName: application.candidateName,
                id: application.id,
                scoreableRound: application.scoreableRound,
              }))}
              initialApplicationId={scoreableApplications.length === 1 ? scoreableApplications[0]!.id : ""}
              interviewerOptions={interviewerOptions}
              returnJobId={job.id}
            />
          </InterviewScoringLayout>
        </StandardDialogContent>
      </Dialog>
    </section>
  )
}
