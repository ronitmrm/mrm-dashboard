import Link from "next/link"
import { notFound } from "next/navigation"

import { createRecruitmentRepository } from "@workspace/db"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { Textarea } from "@workspace/ui/components/textarea"
import { ArrowLeft, BriefcaseBusiness } from "lucide-react"

import {
  recordInterviewAction,
  scheduleInterviewAction,
} from "@/app/hr/actions"
import { CandidateAssignmentPanel } from "@/components/hr/candidate-assignment-panel"
import { readAuthEnvironment } from "@/lib/auth/auth"
import {
  listGrantedCapabilities,
  requireCapability,
} from "@/lib/auth/require-capability"

export const dynamic = "force-dynamic"

const rounds = [
  "Screening Round",
  "Department Round",
  "Management Round",
  "Final HR Round",
] as const

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
  return value ? new Date(value).toLocaleString("en-IN") : "—"
}

function ApplicationOptions({
  applications,
}: {
  applications: Array<{ candidateName: string; id: string }>
}) {
  return (
    <>
      <NativeSelectOption value="">Select applicant</NativeSelectOption>
      {applications.map((application) => (
        <NativeSelectOption key={application.id} value={application.id}>
          {application.candidateName}
        </NativeSelectOption>
      ))}
    </>
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
  const loaded = await (async () => {
    try {
      const organizationId = await repository.organizationIdForCode("MRMPL")
      const [workspace, candidates] = await Promise.all([
        repository.getJobWorkspace(organizationId, id),
        repository.listCandidates(organizationId),
      ])
      return { candidates, workspace }
    } finally {
      await repository.close()
    }
  })()
  if (!loaded.workspace) notFound()

  const { applications, interviews, job } = loaded.workspace
  return (
    <div className="grid gap-6">
      <section className="grid gap-3">
        <Button asChild className="w-fit" size="sm" variant="ghost">
          <Link href="/hr?panel=jobsPanel">
            <ArrowLeft data-icon="inline-start" />
            Back to Job Posts
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
          ["Interview records", String(interviews.length)],
          ["Posted", job.postDate],
          ["Target", job.targetDate ?? "Not set"],
        ].map(([label, value]) => (
          <Card key={label}>
            <CardContent className="p-5">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {label}
              </p>
              <p className="mt-2 text-xl font-semibold">{value}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <CandidateAssignmentPanel
        canWrite={canWrite}
        candidates={loaded.candidates}
        fixedJob={job}
      />

      {canWrite ? (
        <section className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Schedule interview</CardTitle>
              <CardDescription>
                Every scheduled round is retained in this job’s interview
                history.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form action={scheduleInterviewAction}>
                <input name="return_job_id" type="hidden" value={job.id} />
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="job-schedule-application">
                      Applicant
                    </FieldLabel>
                    <NativeSelect
                      className="w-full"
                      id="job-schedule-application"
                      name="application_id"
                      required
                    >
                      <ApplicationOptions applications={applications} />
                    </NativeSelect>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="job-interview-at">
                      Interview date and time
                    </FieldLabel>
                    <Input
                      id="job-interview-at"
                      name="interview_at"
                      required
                      type="datetime-local"
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="job-schedule-round">Round</FieldLabel>
                    <NativeSelect
                      className="w-full"
                      id="job-schedule-round"
                      name="planned_round"
                      required
                    >
                      {rounds.map((round) => (
                        <NativeSelectOption key={round} value={round}>
                          {round}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </Field>
                  <Button disabled={!applications.length} type="submit">
                    Schedule interview
                  </Button>
                </FieldGroup>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Record interview outcome</CardTitle>
              <CardDescription>
                Save the decision, interviewer, score, comments, and joining
                date against the applicant’s round.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form action={recordInterviewAction}>
                <input name="return_job_id" type="hidden" value={job.id} />
                <FieldGroup>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field>
                      <FieldLabel htmlFor="job-outcome-application">
                        Applicant
                      </FieldLabel>
                      <NativeSelect
                        className="w-full"
                        id="job-outcome-application"
                        name="application_id"
                        required
                      >
                        <ApplicationOptions applications={applications} />
                      </NativeSelect>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="job-outcome-round">Round</FieldLabel>
                      <NativeSelect
                        className="w-full"
                        id="job-outcome-round"
                        name="round_name"
                        required
                      >
                        {rounds.map((round) => (
                          <NativeSelectOption key={round} value={round}>
                            {round}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="job-outcome-status">
                        Decision
                      </FieldLabel>
                      <NativeSelect
                        className="w-full"
                        id="job-outcome-status"
                        name="status"
                        required
                      >
                        <NativeSelectOption value="Approved">
                          Approved
                        </NativeSelectOption>
                        <NativeSelectOption value="Rejected">
                          Rejected
                        </NativeSelectOption>
                        <NativeSelectOption value="Hold">
                          Hold
                        </NativeSelectOption>
                      </NativeSelect>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="job-interviewer">
                        Interviewer
                      </FieldLabel>
                      <Input id="job-interviewer" name="interviewer_name" />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="job-score">
                        Overall score / 10
                      </FieldLabel>
                      <Input
                        id="job-score"
                        max="10"
                        min="0"
                        name="score"
                        step="0.1"
                        type="number"
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="job-joining-date">
                        Joining date
                      </FieldLabel>
                      <Input
                        id="job-joining-date"
                        name="joining_date"
                        type="date"
                      />
                    </Field>
                  </div>
                  <Field>
                    <FieldLabel htmlFor="job-outcome-comments">
                      Comments
                    </FieldLabel>
                    <Textarea id="job-outcome-comments" name="comments" />
                  </Field>
                  <Button disabled={!applications.length} type="submit">
                    Save interview outcome
                  </Button>
                </FieldGroup>
              </form>
            </CardContent>
          </Card>
        </section>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Applicants for this job</CardTitle>
          <CardDescription>
            {applications.length} candidate applications assigned to this
            recruitment opening.
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
                  <TableHead>Next interview</TableHead>
                  <TableHead>Planned round</TableHead>
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
                          {application.currentCompany ?? "No current company"}
                        </p>
                      </TableCell>
                      <TableCell>
                        <p>{application.candidatePhone}</p>
                        <p className="text-xs text-muted-foreground">
                          {application.candidateEmail ?? "No email"}
                        </p>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={application.status} />
                      </TableCell>
                      <TableCell>
                        {formatDateTime(application.interviewAt)}
                      </TableCell>
                      <TableCell>{application.plannedRound ?? "—"}</TableCell>
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
                      Search and assign the first candidate to this job.
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
          <CardTitle>Complete interview history</CardTitle>
          <CardDescription>
            Every scheduled round and saved outcome for this recruitment opening
            is listed here.
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
                        {interview.score === null
                          ? "—"
                          : `${interview.score}/10`}
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
                      colSpan={8}
                    >
                      No interviews have been scheduled for this job.
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
