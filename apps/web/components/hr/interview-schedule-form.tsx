"use client"

import type {
  RecruitmentInterviewRow,
  RecruitmentJobApplicationRow,
  RecruitmentJobRow,
} from "@workspace/db"
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
import { useMemo, useState } from "react"

import { scheduleInterviewAction } from "@/app/hr/actions"

type ScheduleOption = {
  applicationId: string
  candidateName: string
  jobId: string
  jobLabel: string
  nextRound: string
}

function ScheduleFields({
  applications,
  fixedJobLabel,
}: {
  applications: ScheduleOption[]
  fixedJobLabel?: string
}) {
  const jobs = useMemo(
    () =>
      Array.from(
        new Map(
          applications.map((application) => [
            application.jobId,
            application.jobLabel,
          ])
        )
      ),
    [applications]
  )
  const [jobId, setJobId] = useState(
    fixedJobLabel && jobs.length === 1 ? jobs[0]![0] : ""
  )
  const [applicationId, setApplicationId] = useState("")
  const [roundName, setRoundName] = useState("")
  const candidates = applications.filter(
    (application) => application.jobId === jobId
  )
  const selectedApplication = applications.find(
    (application) => application.applicationId === applicationId
  )

  function selectJob(nextJobId: string) {
    setJobId(nextJobId)
    setApplicationId("")
    setRoundName("")
  }

  function selectApplication(nextApplicationId: string) {
    setApplicationId(nextApplicationId)
    setRoundName("")
  }

  return (
    <FieldGroup className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <Field>
        <FieldLabel htmlFor="schedule-job">Post / job</FieldLabel>
        {fixedJobLabel ? (
          <>
            <Input id="schedule-job" readOnly value={fixedJobLabel} />
            <input name="job_id" type="hidden" value={jobId} />
          </>
        ) : (
          <NativeSelect
            className="w-full"
            id="schedule-job"
            name="job_id"
            onChange={(event) => selectJob(event.target.value)}
            required
            value={jobId}
          >
            <NativeSelectOption value="">Select post / job</NativeSelectOption>
            {jobs.map(([optionJobId, label]) => (
              <NativeSelectOption key={optionJobId} value={optionJobId}>
                {label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        )}
      </Field>
      <Field>
        <FieldLabel htmlFor="schedule-application">Candidate</FieldLabel>
        <NativeSelect
          className="w-full"
          disabled={!jobId}
          id="schedule-application"
          name="application_id"
          onChange={(event) => selectApplication(event.target.value)}
          required
          value={applicationId}
        >
          <NativeSelectOption value="">
            {jobId ? "Select assigned candidate" : "Select post / job first"}
          </NativeSelectOption>
          {candidates.map((application) => (
            <NativeSelectOption
              key={application.applicationId}
              value={application.applicationId}
            >
              {application.candidateName}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      <Field>
        <FieldLabel htmlFor="schedule-round">Interview round</FieldLabel>
        <NativeSelect
          className="w-full"
          disabled={!selectedApplication}
          id="schedule-round"
          name="round_name"
          onChange={(event) => setRoundName(event.target.value)}
          required
          value={roundName}
        >
          <NativeSelectOption value="">
            {selectedApplication
              ? "Select required round"
              : "Select candidate first"}
          </NativeSelectOption>
          {selectedApplication ? (
            <NativeSelectOption value={selectedApplication.nextRound}>
              {selectedApplication.nextRound}
            </NativeSelectOption>
          ) : null}
        </NativeSelect>
      </Field>
      <Field>
        <FieldLabel htmlFor="schedule-interview-date">Interview date</FieldLabel>
        <Input
          id="schedule-interview-date"
          name="interview_date"
          required
          type="date"
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="schedule-interview-time">Interview time</FieldLabel>
        <Input
          id="schedule-interview-time"
          name="interview_time"
          required
          type="time"
        />
      </Field>
      <Button
        className="self-end"
        disabled={!jobId || !applicationId || !roundName}
        type="submit"
      >
        Schedule interview
      </Button>
    </FieldGroup>
  )
}

export function InterviewScheduleForm({
  interviews,
}: {
  interviews: RecruitmentInterviewRow[]
}) {
  const applications = interviews.flatMap((row): ScheduleOption[] =>
    row.nextRound && !row.scoreableRound
      ? [
          {
            applicationId: row.applicationId,
            candidateName: row.candidateName,
            jobId: row.jobId,
            jobLabel: `${row.postCode ?? row.jobNumber} · ${row.jobTitle}`,
            nextRound: row.nextRound,
          },
        ]
      : []
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Schedule interview</CardTitle>
        <CardDescription>
          Select the post first, then its assigned candidate and required round.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={scheduleInterviewAction}>
          <input name="panel" type="hidden" value="interviewsPanel" />
          <ScheduleFields applications={applications} />
        </form>
      </CardContent>
    </Card>
  )
}

export function JobInterviewScheduleForm({
  applications,
  job,
}: {
  applications: RecruitmentJobApplicationRow[]
  job: RecruitmentJobRow
}) {
  const options = applications.flatMap((application): ScheduleOption[] =>
    application.nextRound && !application.scoreableRound
      ? [
          {
            applicationId: application.id,
            candidateName: application.candidateName,
            jobId: job.id,
            jobLabel: `${job.postCode ?? job.jobNumber} · ${job.title}`,
            nextRound: application.nextRound,
          },
        ]
      : []
  )

  return (
    <form action={scheduleInterviewAction}>
      <input name="return_job_id" type="hidden" value={job.id} />
      <ScheduleFields
        applications={options}
        fixedJobLabel={`${job.postCode ?? job.jobNumber} · ${job.title}`}
      />
    </form>
  )
}
