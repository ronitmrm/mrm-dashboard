"use client"

import type {
  RecruitmentInterviewRecordRow,
  RecruitmentInterviewRow,
} from "@workspace/db"
import { recruitmentInterviewRound } from "@workspace/db/recruitment-interview-workflow"
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
import { Field, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/components/sheet"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import {
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  ListTodo,
} from "lucide-react"
import Link from "next/link"
import { useMemo, useState } from "react"

import { CandidateAppointmentDialog } from "@/components/hr/candidate-appointment-dialog"
import { InterviewOutcomeForm } from "@/components/hr/interview-outcome-form"

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={status === "Approved" ? "default" : "outline"}>
      {status}
    </Badge>
  )
}

function dateKey(value: string | null) {
  if (!value) return ""
  return new Date(value).toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
  })
}

function formatDate(value: string | null) {
  return value
    ? new Date(value).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "2-digit",
        timeZone: "Asia/Kolkata",
        year: "numeric",
      })
    : "—"
}

function formatTime(value: string | null) {
  return value
    ? new Date(value).toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Kolkata",
      })
    : "—"
}

function formatSalary(value: number | null) {
  return value === null
    ? "—"
    : `₹ ${new Intl.NumberFormat("en-IN", {
        maximumFractionDigits: 2,
      }).format(value)}`
}

function SummaryCards({
  items,
}: {
  items: Array<{
    icon: typeof CalendarClock
    label: string
    value: number
  }>
}) {
  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      {items.map(({ icon: Icon, label, value }) => (
        <MetricCard
          icon={<Icon className="size-5" />}
          key={label}
          label={label}
          value={value}
        />
      ))}
    </div>
  )
}

export function InterviewScheduleBoard({
  appointmentApplicationId,
  canWrite,
  interviews,
}: {
  appointmentApplicationId?: string
  canWrite: boolean
  interviews: RecruitmentInterviewRow[]
}) {
  const [selectedDate, setSelectedDate] = useState("")
  const [selectedInterview, setSelectedInterview] =
    useState<RecruitmentInterviewRow | null>(null)
  const [dismissedAppointmentId, setDismissedAppointmentId] = useState<
    string | null
  >(null)
  const appointmentInterview = appointmentApplicationId
    ? interviews.find(
        (row) =>
          row.applicationId === appointmentApplicationId &&
          row.status === "Approved" &&
          row.nextRound === null
      )
    : undefined
  const planned = useMemo(
    () => interviews.filter((row) => row.scoreableRound !== null),
    [interviews]
  )
  const visiblePlanned = selectedDate
    ? planned.filter((row) => dateKey(row.interviewAt) === selectedDate)
    : planned
  const awaitingSchedule = interviews.filter(
    (row) => row.nextRound !== null && row.scoreableRound === null
  )

  return (
    <Sheet
      onOpenChange={(open) => {
        if (!open) setSelectedInterview(null)
      }}
      open={selectedInterview !== null && !appointmentInterview}
    >
      <SummaryCards
        items={[
          {
            icon: CalendarClock,
            label: selectedDate
              ? "Interviews On Selected Date"
              : "All Pending Interviews",
            value: visiblePlanned.length,
          },
          {
            icon: ListTodo,
            label: "Need Scheduling",
            value: awaitingSchedule.length,
          },
          {
            icon: ClipboardCheck,
            label: "All Scheduled",
            value: planned.length,
          },
          {
            icon: CheckCircle2,
            label: "Applications",
            value: interviews.length,
          },
        ]}
      />

      <Card>
        <CardHeader className="gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <CardTitle>Interview Schedule</CardTitle>
            <CardDescription>
              Select A Date To See Exactly How Many Interviews Are Planned That
              Day.
            </CardDescription>
          </div>
          <Field className="w-full sm:w-64">
            <FieldLabel htmlFor="interview-schedule-date">View Date</FieldLabel>
            <Input
              id="interview-schedule-date"
              onChange={(event) => setSelectedDate(event.target.value)}
              type="date"
              value={selectedDate}
            />
          </Field>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Candidate</TableHead>
                <TableHead>Job</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Round</TableHead>
                {canWrite ? (
                  <TableHead className="text-right">Action</TableHead>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {visiblePlanned.length ? (
                visiblePlanned.map((row) => (
                  <TableRow key={row.applicationId}>
                    <TableCell>
                      <Link
                        className="font-medium text-primary underline-offset-4 hover:underline focus-visible:underline"
                        href={`/hr/candidates/${row.candidateId}`}
                        title="Open candidate profile and conversation log"
                      >
                        {row.candidateName}
                      </Link>
                    </TableCell>
                    <TableCell>{row.jobTitle}</TableCell>
                    <TableCell>{formatDate(row.interviewAt)}</TableCell>
                    <TableCell>{formatTime(row.interviewAt)}</TableCell>
                    <TableCell>{row.scoreableRound}</TableCell>
                    {canWrite ? (
                      <TableCell className="text-right">
                        <Button
                          onClick={() => setSelectedInterview(row)}
                          size="sm"
                          type="button"
                        >
                          Record Outcome
                        </Button>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    className="py-10 text-center text-muted-foreground"
                    colSpan={canWrite ? 6 : 5}
                  >
                    No Interviews Are Scheduled For This Date.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {selectedInterview ? (
        <SheetContent className="w-full overflow-y-auto sm:max-w-3xl">
          <SheetHeader>
            <SheetTitle>Interview Outcome</SheetTitle>
            <SheetDescription>
              {selectedInterview.candidateName} · {selectedInterview.jobTitle} ·{" "}
              {selectedInterview.scoreableRound}
            </SheetDescription>
          </SheetHeader>
          <div className="px-6 pb-6">
            <InterviewOutcomeForm
              applications={[
                {
                  candidateName: `${selectedInterview.candidateName} · ${selectedInterview.jobTitle}`,
                  id: selectedInterview.applicationId,
                  scoreableRound: selectedInterview.scoreableRound,
                },
              ]}
              initialApplicationId={selectedInterview.applicationId}
              panelId="interviewsPanel"
            />
          </div>
        </SheetContent>
      ) : null}
      {appointmentInterview && canWrite ? (
        <CandidateAppointmentDialog
          applicationId={appointmentInterview.applicationId}
          candidateName={appointmentInterview.candidateName}
          defaultJoiningDate={appointmentInterview.joiningDate}
          onOpenChange={(open) => {
            if (!open) {
              setDismissedAppointmentId(appointmentInterview.applicationId)
            }
          }}
          open={dismissedAppointmentId !== appointmentInterview.applicationId}
          panelId="interviewsPanel"
        />
      ) : null}
    </Sheet>
  )
}

export function InterviewResultsWorkspace({
  records,
}: {
  records: RecruitmentInterviewRecordRow[]
}) {
  const [selectedRecord, setSelectedRecord] =
    useState<RecruitmentInterviewRecordRow | null>(null)
  const completed = records.filter((row) => row.status !== "Scheduled")
  const approved = completed.filter((row) => row.status === "Approved")
  const held = completed.filter((row) => row.status === "Hold")
  const rejected = completed.filter((row) => row.status === "Rejected")
  const questions = selectedRecord
    ? (recruitmentInterviewRound(selectedRecord.roundName)?.questions ?? [])
    : []

  return (
    <Sheet
      onOpenChange={(open) => {
        if (!open) setSelectedRecord(null)
      }}
      open={selectedRecord !== null}
    >
      <SummaryCards
        items={[
          {
            icon: ClipboardCheck,
            label: "Completed Interviews",
            value: completed.length,
          },
          { icon: CheckCircle2, label: "Approved", value: approved.length },
          { icon: CalendarClock, label: "On Hold", value: held.length },
          { icon: ListTodo, label: "Rejected", value: rejected.length },
        ]}
      />
      <Card>
        <CardHeader>
          <CardTitle>Interview Workspace</CardTitle>
          <CardDescription>
            Open Any Completed Round To Review That Candidate’s Full Result.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Candidate</TableHead>
                <TableHead>Job</TableHead>
                <TableHead>Round</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Outcome</TableHead>
                <TableHead>Score</TableHead>
                <TableHead className="text-right">Result</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.length ? (
                records.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.candidateName}</TableCell>
                    <TableCell>
                      {row.jobNumber} · {row.jobTitle}
                    </TableCell>
                    <TableCell>{row.roundName}</TableCell>
                    <TableCell>{formatDate(row.scheduledAt)}</TableCell>
                    <TableCell>{formatTime(row.scheduledAt)}</TableCell>
                    <TableCell>
                      <StatusBadge status={row.status} />
                    </TableCell>
                    <TableCell>{row.score ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        onClick={() => setSelectedRecord(row)}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        Open Result
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    className="py-10 text-center text-muted-foreground"
                    colSpan={8}
                  >
                    No Interview Rounds Found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {selectedRecord ? (
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>{selectedRecord.roundName} Result</SheetTitle>
            <SheetDescription>
              {selectedRecord.candidateName} · {selectedRecord.jobNumber} ·{" "}
              {selectedRecord.jobTitle}
            </SheetDescription>
          </SheetHeader>
          <div className="grid gap-5 px-6 pb-6">
            <div className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2">
              <p>
                <span className="text-muted-foreground">Date:</span>{" "}
                {formatDate(selectedRecord.scheduledAt)}
              </p>
              <p>
                <span className="text-muted-foreground">Time:</span>{" "}
                {formatTime(selectedRecord.scheduledAt)}
              </p>
              <p>
                <span className="text-muted-foreground">Outcome:</span>{" "}
                {selectedRecord.status}
              </p>
              <p>
                <span className="text-muted-foreground">Score:</span>{" "}
                {selectedRecord.score ?? "—"}
              </p>
              <p>
                <span className="text-muted-foreground">Interviewer:</span>{" "}
                {selectedRecord.interviewerName ?? "—"}
              </p>
              <p>
                <span className="text-muted-foreground">Joining Date:</span>{" "}
                {selectedRecord.joiningDate ?? "—"}
              </p>
              {selectedRecord.roundName === "HR Round" ? (
                <>
                  <p>
                    <span className="text-muted-foreground">
                      Willing To Join:
                    </span>{" "}
                    {selectedRecord.willingToJoin === null
                      ? "—"
                      : selectedRecord.willingToJoin
                        ? "Yes"
                        : "No"}
                  </p>
                  <p>
                    <span className="text-muted-foreground">
                      Before Probation:
                    </span>{" "}
                    {formatSalary(selectedRecord.salaryBeforeProbation)}
                  </p>
                  <p>
                    <span className="text-muted-foreground">
                      After Probation:
                    </span>{" "}
                    {selectedRecord.salaryAfterProbationMinimum === null ||
                    selectedRecord.salaryAfterProbationMaximum === null
                      ? "—"
                      : `${formatSalary(selectedRecord.salaryAfterProbationMinimum)} to ${formatSalary(selectedRecord.salaryAfterProbationMaximum)}`}
                  </p>
                </>
              ) : null}
            </div>
            <div className="grid gap-3">
              <h3 className="font-medium">Round Assessment</h3>
              {questions.length ? (
                questions.map((question) => (
                  <div
                    className="flex items-center justify-between gap-4 rounded-lg border p-3"
                    key={question.id}
                  >
                    <span>{question.prompt}</span>
                    <Badge variant="outline">
                      {selectedRecord.questionScores[question.id] ?? "—"}
                    </Badge>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  No Scored Questions For This Record.
                </p>
              )}
            </div>
            <div>
              <h3 className="font-medium">Comments</h3>
              <p className="mt-2 text-sm whitespace-pre-wrap text-muted-foreground">
                {selectedRecord.comments ?? "No comments recorded."}
              </p>
            </div>
          </div>
        </SheetContent>
      ) : null}
    </Sheet>
  )
}
