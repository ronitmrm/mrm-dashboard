"use client"

import type { RecruitmentJobApplicationRow, RecruitmentJobRow } from "@workspace/db"
import { Button } from "@workspace/ui/components/button"
import { Dialog, DialogTrigger } from "@workspace/ui/components/dialog"
import Link from "next/link"

import { JobInterviewScheduleForm } from "@/components/hr/interview-schedule-form"
import { StandardDialogContent } from "@/components/ui/golden-patterns"

export function JobInterviewActions({
  applications,
  job,
}: {
  applications: RecruitmentJobApplicationRow[]
  job: RecruitmentJobRow
}) {
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

      <Button asChild>
        <Link href={`/hr/jobs/${job.id}/interview`}>Record Interview Outcome</Link>
      </Button>
    </section>
  )
}
