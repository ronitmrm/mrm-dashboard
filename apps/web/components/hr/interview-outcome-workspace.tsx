"use client"

import type { RecruitmentJobApplicationRow, RecruitmentJobRow } from "@workspace/db"
import { Button } from "@workspace/ui/components/button"
import { CardContent, CardHeader, CardTitle, SectionCard } from "@workspace/ui/components/card"
import { StandardState } from "@workspace/ui/components/standard-state"
import { ArrowLeft, ClipboardCheck, Download } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import { InterviewOutcomeForm } from "@/components/hr/interview-outcome-form"
import { JobTemplateReference } from "@/components/hr/job-template-preview"
import { PdfPreview } from "@/components/pdf-preview"
import { PageHeader } from "@/components/ui/golden-patterns"

export function InterviewOutcomeWorkspace({
  applications,
  initialApplicationId,
  interviewerOptions,
  job,
  source,
}: {
  applications: RecruitmentJobApplicationRow[]
  initialApplicationId: string
  interviewerOptions: Array<{ code: string; name: string }>
  job: RecruitmentJobRow
  source: "job" | "schedule"
}) {
  const [applicationId, setApplicationId] = useState(initialApplicationId)
  const application = applications.find((row) => row.id === applicationId)
  const resumeHref = application
    ? `/hr/jobs/${job.id}/interview/resume?application=${encodeURIComponent(application.id)}`
    : null
  const backHref = source === "schedule" ? "/hr?panel=interviewsPanel" : `/hr/jobs/${job.id}`

  return (
    <div className="grid min-w-0 gap-5">
      <PageHeader
        actions={
          <Button asChild size="sm" variant="outline">
            <Link href={backHref}>
              <ArrowLeft data-icon="inline-start" />
              Back
            </Link>
          </Button>
        }
        description={`${job.title} · ${job.jobNumber}`}
        icon={ClipboardCheck}
        title="Record Interview Outcome"
      />

      <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(28rem,1fr)]">
        <div className="grid min-w-0 gap-5">
          <aside className="min-w-0 max-h-56 overflow-y-auto xl:sticky xl:top-4 xl:z-10 xl:bg-background">
            <JobTemplateReference code={job.requirementTemplateCode} />
          </aside>

          <SectionCard className="min-w-0">
            <CardHeader>
              <CardTitle>Interview Assessment</CardTitle>
            </CardHeader>
            <CardContent>
              <InterviewOutcomeForm
                applications={applications.map((row) => ({
                  candidateName: row.candidateName,
                  id: row.id,
                  scoreableRound: row.scoreableRound,
                }))}
                initialApplicationId={applicationId}
                interviewerOptions={interviewerOptions}
                key={applicationId}
                onApplicationChange={setApplicationId}
                panelId={source === "schedule" ? "interviewsPanel" : undefined}
                returnJobId={source === "job" ? job.id : undefined}
              />
            </CardContent>
          </SectionCard>
        </div>

        <SectionCard className="flex min-h-[36rem] min-w-0 flex-col xl:sticky xl:top-4 xl:h-[calc(100dvh-2rem)] xl:min-h-0">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <CardTitle>Candidate Resume</CardTitle>
              <p className="truncate text-sm text-muted-foreground">
                {application?.candidateName ?? "Select an applicant"}
              </p>
            </div>
            {application?.hasResume && resumeHref ? (
              <Button asChild size="sm" variant="outline">
                <a href={resumeHref}>
                  <Download data-icon="inline-start" />
                  Download
                </a>
              </Button>
            ) : null}
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col px-0">
            {application?.hasResume && resumeHref ? (
              <PdfPreview source={`${resumeHref}&preview`} />
            ) : (
              <StandardState
                description={application ? "No resume is attached to this candidate." : "Choose an applicant to view their resume."}
                title={application ? "Resume unavailable" : "Select an applicant"}
                variant="empty"
              />
            )}
          </CardContent>
        </SectionCard>
      </div>
    </div>
  )
}
