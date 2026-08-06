"use client"

import { useId, useMemo, useState } from "react"
import { useFormStatus } from "react-dom"

import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"

import { assignCandidateAction } from "@/app/hr/actions"

type CandidateOption = {
  activeApplicationJobIds: string[]
  departments: string[]
  email: string | null
  id: string
  name: string
  phone: string
}

type JobOption = {
  id: string
  title: string
  vacancyCode: string
}

function AssignmentSubmitButton({
  disabled,
  selectedCount,
}: {
  disabled: boolean
  selectedCount: number
}) {
  const { pending } = useFormStatus()
  return (
    <Button
      className="md:col-span-2 xl:col-span-3"
      disabled={disabled || pending}
      type="submit"
    >
      {pending
        ? "Assigning candidates…"
        : `Assign ${selectedCount || "selected"} candidate${selectedCount === 1 ? "" : "s"} to job`}
    </Button>
  )
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
  const fieldId = useId()
  const [candidateSearch, setCandidateSearch] = useState("")
  const [jobId, setJobId] = useState(fixedJob?.id ?? "")
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<string[]>([])
  const selectedCandidateSet = useMemo(
    () => new Set(selectedCandidateIds),
    [selectedCandidateIds]
  )
  const normalizedSearch = candidateSearch.trim().toLocaleLowerCase("en-IN")
  const visibleCandidates = useMemo(() => {
    if (!normalizedSearch) return candidates
    return candidates.filter((candidate) =>
      [
        candidate.name,
        candidate.phone,
        candidate.email ?? "",
        candidate.departments.join(" "),
      ].some((value) =>
        value.toLocaleLowerCase("en-IN").includes(normalizedSearch)
      )
    )
  }, [candidates, normalizedSearch])
  const eligibleVisibleCandidateIds = visibleCandidates
    .filter(
      (candidate) => jobId && !candidate.activeApplicationJobIds.includes(jobId)
    )
    .map((candidate) => candidate.id)

  function changeJob(nextJobId: string) {
    setJobId(nextJobId)
    setSelectedCandidateIds([])
  }

  function changeCandidate(candidateId: string, checked: boolean) {
    setSelectedCandidateIds((current) =>
      checked
        ? current.includes(candidateId)
          ? current
          : [...current, candidateId]
        : current.filter((id) => id !== candidateId)
    )
  }

  function selectAllVisible() {
    setSelectedCandidateIds((current) => [
      ...new Set([...current, ...eligibleVisibleCandidateIds]),
    ])
  }

  return (
    <form action={assignCandidateAction}>
      {fixedJob ? (
        <input name="return_job_id" type="hidden" value={fixedJob.id} />
      ) : (
        <input name="panel" type="hidden" value="candidateSearchPanel" />
      )}
      <input name="job_id" type="hidden" value={jobId} />
      {selectedCandidateIds.map((candidateId) => (
        <input
          key={candidateId}
          name="candidate_ids"
          type="hidden"
          value={candidateId}
        />
      ))}

      <FieldGroup className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Field className="md:col-span-2 xl:col-span-3">
          <FieldLabel htmlFor={`${fieldId}-job`}>Open job</FieldLabel>
          {fixedJob ? (
            <Input
              id={`${fieldId}-job`}
              readOnly
              value={`${fixedJob.vacancyCode} · ${fixedJob.title}`}
            />
          ) : (
            <NativeSelect
              className="w-full"
              id={`${fieldId}-job`}
              onChange={(event) => changeJob(event.target.value)}
              required
              value={jobId}
            >
              <NativeSelectOption value="">Select job</NativeSelectOption>
              {jobs.map((job) => (
                <NativeSelectOption key={job.id} value={job.id}>
                  {job.vacancyCode} · {job.title}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          )}
        </Field>

        <Field className="md:col-span-2 xl:col-span-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <FieldLabel htmlFor={`${fieldId}-candidate-search`}>
                Search and select candidates
              </FieldLabel>
              <p className="mt-1 text-xs text-muted-foreground">
                Search by name, phone, email, or department.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                disabled={!eligibleVisibleCandidateIds.length}
                onClick={selectAllVisible}
                size="sm"
                type="button"
                variant="outline"
              >
                Select all shown
              </Button>
              <Button
                disabled={!selectedCandidateIds.length}
                onClick={() => setSelectedCandidateIds([])}
                size="sm"
                type="button"
                variant="ghost"
              >
                Clear
              </Button>
            </div>
          </div>
          <Input
            className="mt-3"
            id={`${fieldId}-candidate-search`}
            onChange={(event) => setCandidateSearch(event.target.value)}
            placeholder="Type a candidate name, phone, email, or department"
            type="search"
            value={candidateSearch}
          />
        </Field>

        <div
          aria-label="Candidates for assignment"
          className="max-h-80 space-y-2 overflow-y-auto rounded-xl border border-border bg-muted/20 p-2 md:col-span-2 xl:col-span-3"
          role="group"
        >
          {!jobId ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              Select an open job to choose candidates.
            </p>
          ) : visibleCandidates.length ? (
            visibleCandidates.map((candidate) => {
              const hasActiveApplication =
                candidate.activeApplicationJobIds.includes(jobId)
              const checked = selectedCandidateSet.has(candidate.id)
              return (
                <label
                  className={
                    hasActiveApplication
                      ? "flex cursor-not-allowed items-start gap-3 rounded-lg border border-border/60 bg-muted/50 p-3 opacity-70"
                      : "flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-background p-3 transition-colors hover:border-primary/55 hover:bg-primary/5"
                  }
                  key={candidate.id}
                >
                  <Checkbox
                    aria-label={`Select ${candidate.name}`}
                    checked={checked}
                    disabled={hasActiveApplication}
                    onCheckedChange={(value) =>
                      changeCandidate(candidate.id, value === true)
                    }
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{candidate.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {candidate.phone}
                      {candidate.email ? ` · ${candidate.email}` : ""}
                      {candidate.departments.length
                        ? ` · ${candidate.departments.join(", ")}`
                        : ""}
                    </span>
                  </span>
                  {hasActiveApplication ? (
                    <span className="shrink-0 text-xs font-medium text-muted-foreground">
                      Already assigned
                    </span>
                  ) : null}
                </label>
              )
            })
          ) : (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              No candidates match this search.
            </p>
          )}
        </div>

        <p
          aria-live="polite"
          className="text-sm text-muted-foreground md:col-span-2 xl:col-span-3"
        >
          {selectedCandidateIds.length} candidate
          {selectedCandidateIds.length === 1 ? "" : "s"} selected. Interviews
          are scheduled individually after assignment.
        </p>
        <AssignmentSubmitButton
          disabled={!jobId || !selectedCandidateIds.length}
          selectedCount={selectedCandidateIds.length}
        />
      </FieldGroup>
    </form>
  )
}
