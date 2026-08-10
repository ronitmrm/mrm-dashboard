import Link from "next/link"
import { notFound } from "next/navigation"

import { createRecruitmentRepository } from "@workspace/db"
import { recruitmentInterviewRound } from "@workspace/db/recruitment-interview-workflow"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  MetricCard,
} from "@workspace/ui/components/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { ArrowLeft, BriefcaseBusiness, UserPlus } from "lucide-react"

import { InterviewOutcomeForm } from "@/components/hr/interview-outcome-form"
import { JobInterviewScheduleForm } from "@/components/hr/interview-schedule-form"
import { readAuthEnvironment } from "@/lib/auth/auth"
import {
  listGrantedCapabilities,
  requireCapability,
} from "@/lib/auth/require-capability"

export const dynamic = "force-dynamic"

function StatusBadge({ status }: { status: string }) {
  const variant =
    status === "Open" || status === "Approved"
      ? "default"
      : status === "Rejected"
        ? "destructive"
        : status === "Scheduled" || status === "Interview"
          ? "secondary"
          : "outline"
  return <Badge variant={variant}>{status}</Badge>
}

function formatDateTime(value: string | null) {
  return value
    ? new Date(value).toLocaleString("en-GB", {
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        month: "2-digit",
        timeZone: "Asia/Kolkata",
        year: "numeric",
      })
    : "—"
}

function formatInterviewScore(score: number | null) {
  if (score === null) return "—"
  return score > 5 ? `${score}/10 (legacy)` : `${score}/5`
}

function InterviewAssessment({
  questionScores,
  roundName,
}: {
  questionScores: Record<string, number>
  roundName: string
}) {
  const round = recruitmentInterviewRound(roundName)
  const scoredQuestions =
    round?.questions.filter(
      (question) => questionScores[question.id] !== undefined
    ) ?? []
  if (!scoredQuestions.length) return <span>—</span>
  return (
    <div className="grid min-w-72 gap-1 text-xs">
      {scoredQuestions.map((question) => (
        <div className="flex justify-between gap-4" key={question.id}>
          <span className="text-muted-foreground">{question.prompt}</span>
          <span className="font-medium tabular-nums">
            {questionScores[question.id]}/5
          </span>
        </div>
      ))}
    </div>
  )
}

export default async function JobWorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string; success?: string }>
}) {
  const { id } = await params
  const feedback = await searchParams
  const returnPath = `/hr/jobs/${id}`
  const session = await requireCapability("hr.recruitment.read", returnPath)
  const grants = await listGrantedCapabilities(session.user.id, [
    "hr.recruitment.write",
  ])
  const canWrite = grants.includes("hr.recruitment.write")
  const repository = createRecruitmentRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const workspace = await (async () => {
    try {
      const organizationId = await repository.organizationIdForCode("MRMPL")
      return repository.getJobWorkspace(organizationId, id)
    } finally {
      await repository.close()
    }
  })()
  if (!workspace) notFound()

  const { applications, interviews, job } = workspace
  return (
    <div className="grid gap-6">
      <section className="grid gap-3">
        <Button asChild className="w-fit" size="sm" variant="ghost">
          <Link href="/hr?panel=jobsPanel">
            <ArrowLeft data-icon="inline-start" />
            Back To Job Posts
          </Link>
        </Button>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="grid gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <BriefcaseBusiness className="size-5 text-primary" />
              <h2 className="text-2xl font-semibold tracking-tight">
                {job.title}
              </h2>
              <StatusBadge status={job.status} />
            </div>
            <p className="text-sm text-muted-foreground">
              {job.jobNumber} · Vacancy {job.vacancyCode} · Approved Post{" "}
              {job.postCode ?? "—"}
            </p>
          </div>
          {canWrite ? (
            <Button asChild className="shrink-0" size="sm">
              <Link
                href={`/hr?panel=candidateSearchPanel&job=${encodeURIComponent(job.id)}&returnJob=${encodeURIComponent(job.id)}`}
              >
                <UserPlus data-icon="inline-start" />
                Assign Candidates
              </Link>
            </Button>
          ) : null}
        </div>
      </section>

      {feedback.error ? (
        <Alert variant="destructive">
          <AlertDescription>{feedback.error}</AlertDescription>
        </Alert>
      ) : null}
      {feedback.success ? (
        <Alert>
          <AlertDescription>{feedback.success}</AlertDescription>
        </Alert>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Applicants", String(applications.length)],
          ["Interview Records", String(interviews.length)],
          ["Posted", job.postDate],
          ["Target", job.targetDate ?? "Not Set"],
        ].map(([label, value]) => (
          <MetricCard key={label} label={label} value={value} />
        ))}
      </section>

      {canWrite ? (
        <section className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Schedule Interview</CardTitle>
              <CardDescription>
                Select An Assigned Candidate And Confirm The Required Next
                Round.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <JobInterviewScheduleForm
                applications={applications}
                job={job}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Record Interview Outcome</CardTitle>
              <CardDescription>
                The Required Round Is Locked. Complete Every Preset Question To
                Save A Unified Assessment.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <InterviewOutcomeForm
                applications={applications.map((application) => ({
                  candidateName: application.candidateName,
                  id: application.id,
                  scoreableRound: application.scoreableRound,
                }))}
                returnJobId={job.id}
              />
            </CardContent>
          </Card>
        </section>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Applicants For This Job</CardTitle>
          <CardDescription>
            {applications.length} Candidate Applications Assigned To This
            Recruitment Opening.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-2xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Candidate</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Next Interview</TableHead>
                  <TableHead>Required Round</TableHead>
                  <TableHead className="text-right">Rounds</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {applications.length ? (
                  applications.map((application) => (
                    <TableRow key={application.id}>
                      <TableCell>
                        <p className="font-medium">
                          {application.candidateName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {application.currentCompany ?? "No Current Company"}
                        </p>
                      </TableCell>
                      <TableCell>
                        <p>{application.candidatePhone}</p>
                        <p className="text-xs text-muted-foreground">
                          {application.candidateEmail ?? "No Email"}
                        </p>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={application.status} />
                      </TableCell>
                      <TableCell>
                        {formatDateTime(application.interviewAt)}
                      </TableCell>
                      <TableCell>
                        {application.nextRound ??
                          (application.status === "Approved"
                            ? "All Rounds Approved"
                            : "Application Closed")}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {application.interviewCount}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      className="py-10 text-center text-muted-foreground"
                      colSpan={6}
                    >
                      Search And Assign The First Candidate To This Job.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Complete Interview History</CardTitle>
          <CardDescription>
            Every Scheduled Round And Saved Outcome For This Recruitment Opening
            Is Listed Here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-2xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Candidate</TableHead>
                  <TableHead>Round</TableHead>
                  <TableHead>Scheduled</TableHead>
                  <TableHead>Outcome</TableHead>
                  <TableHead>Interviewer</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Assessment</TableHead>
                  <TableHead>Comments</TableHead>
                  <TableHead>Joining</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {interviews.length ? (
                  interviews.map((interview) => (
                    <TableRow key={interview.id}>
                      <TableCell className="font-medium">
                        {interview.candidateName}
                      </TableCell>
                      <TableCell>{interview.roundName}</TableCell>
                      <TableCell>
                        {formatDateTime(interview.scheduledAt)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={interview.status} />
                      </TableCell>
                      <TableCell>{interview.interviewerName ?? "—"}</TableCell>
                      <TableCell>
                        {formatInterviewScore(interview.score)}
                      </TableCell>
                      <TableCell className="align-top whitespace-normal">
                        <InterviewAssessment
                          questionScores={interview.questionScores}
                          roundName={interview.roundName}
                        />
                      </TableCell>
                      <TableCell className="min-w-56 whitespace-normal">
                        {interview.comments ?? "—"}
                      </TableCell>
                      <TableCell>{interview.joiningDate ?? "—"}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      className="py-10 text-center text-muted-foreground"
                      colSpan={9}
                    >
                      No Interviews Have Been Scheduled For This Job.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
