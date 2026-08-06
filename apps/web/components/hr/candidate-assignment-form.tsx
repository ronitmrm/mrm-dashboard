"use client"

import { useState } from "react"

import { Button } from "@workspace/ui/components/button"
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"

import { assignCandidateAction } from "@/app/hr/actions"

type CandidateOption = {
  activeApplicationJobIds: string[]
  id: string
  name: string
  phone: string
}

type JobOption = {
  id: string
  title: string
  vacancyCode: string
}

export function CandidateAssignmentForm({
  candidates,
  fixedJob,
  jobs,
}: {
  candidates: CandidateOption[]
  fixedJob?: JobOption
  jobs: JobOption[]
}) {
  const [candidateId, setCandidateId] = useState("")
  const [jobId, setJobId] = useState(fixedJob?.id ?? "")
  const selectedCandidate = candidates.find(
    (candidate) => candidate.id === candidateId
  )
  const hasActiveApplication = Boolean(
    selectedCandidate?.activeApplicationJobIds.includes(jobId)
  )

  return (
    <form action={assignCandidateAction}>
      {fixedJob ? (
        <input name="return_job_id" type="hidden" value={fixedJob.id} />
      ) : (
        <input name="panel" type="hidden" value="candidateSearchPanel" />
      )}
      <FieldGroup className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Field>
          <FieldLabel htmlFor="assign-candidate">Candidate</FieldLabel>
          <NativeSelect
            aria-describedby="active-application-help"
            className="w-full"
            id="assign-candidate"
            name="candidate_id"
            onChange={(event) => setCandidateId(event.target.value)}
            required
            value={candidateId}
          >
            <NativeSelectOption value="">Select candidate</NativeSelectOption>
            {candidates.map((candidate) => {
              const blockedForFixedJob = Boolean(
                fixedJob &&
                candidate.activeApplicationJobIds.includes(fixedJob.id)
              )
              return (
                <NativeSelectOption
                  disabled={blockedForFixedJob}
                  key={candidate.id}
                  value={candidate.id}
                >
                  {candidate.name} · {candidate.phone}
                  {blockedForFixedJob ? " · Active application" : ""}
                </NativeSelectOption>
              )
            })}
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor="assign-job">Open job</FieldLabel>
          {fixedJob ? (
            <>
              <input name="job_id" type="hidden" value={fixedJob.id} />
              <Input
                id="assign-job"
                readOnly
                value={`${fixedJob.vacancyCode} · ${fixedJob.title}`}
              />
            </>
          ) : (
            <NativeSelect
              aria-describedby="active-application-help"
              className="w-full"
              id="assign-job"
              name="job_id"
              onChange={(event) => setJobId(event.target.value)}
              required
              value={jobId}
            >
              <NativeSelectOption value="">Select job</NativeSelectOption>
              {jobs.map((job) => {
                const blockedForCandidate = Boolean(
                  selectedCandidate?.activeApplicationJobIds.includes(job.id)
                )
                return (
                  <NativeSelectOption
                    disabled={blockedForCandidate}
                    key={job.id}
                    value={job.id}
                  >
                    {job.vacancyCode} · {job.title}
                    {blockedForCandidate ? " · Active application" : ""}
                  </NativeSelectOption>
                )
              })}
            </NativeSelect>
          )}
        </Field>
        <p
          aria-live="polite"
          className={
            hasActiveApplication
              ? "text-sm font-medium text-destructive md:col-span-2 xl:col-span-3"
              : "text-sm text-muted-foreground md:col-span-2 xl:col-span-3"
          }
          id="active-application-help"
        >
          {hasActiveApplication
            ? "This candidate already has an active application for this job. Complete or close it before applying again."
            : "A candidate can reapply to the same job after the earlier application is approved, rejected, or withdrawn."}
        </p>
        <Button
          className="md:col-span-2 xl:col-span-3"
          disabled={hasActiveApplication}
          type="submit"
        >
          Assign to job
        </Button>
      </FieldGroup>
    </form>
  )
}
