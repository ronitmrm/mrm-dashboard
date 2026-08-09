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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import { assignCandidateAction } from "@/app/hr/actions"
import {
  ExcelColumnFilter,
  matchesColumnFilter,
  uniqueFilterOptions,
} from "@/components/hr/excel-column-filter"

type CandidateOption = {
  activeApplicationJobIds: string[]
  currentCompany: string | null
  departments: string[]
  email: string | null
  experience: string | null
  id: string
  name: string
  phone: string
  source: string | null
  status: string
}

type JobOption = {
  id: string
  title: string
  vacancyCode: string
}

type FilterKey =
  | "company"
  | "departments"
  | "email"
  | "experience"
  | "name"
  | "phone"
  | "source"
  | "status"

const emptyFilters: Record<FilterKey, string[] | null> = {
  company: null,
  departments: null,
  email: null,
  experience: null,
  name: null,
  phone: null,
  source: null,
  status: null,
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
    <Button disabled={disabled || pending} type="submit">
      {pending
        ? "Assigning candidates…"
        : `Assign ${selectedCount || "selected"} candidate${selectedCount === 1 ? "" : "s"} to job`}
    </Button>
  )
}

export function CandidateAssignmentForm({
  candidates,
  fixedJob,
  initialJobId,
  jobs,
}: {
  candidates: CandidateOption[]
  fixedJob?: JobOption
  initialJobId?: string
  jobs: JobOption[]
}) {
  const fieldId = useId()
  const [jobId, setJobId] = useState(() =>
    fixedJob
      ? fixedJob.id
      : jobs.some((job) => job.id === initialJobId)
        ? (initialJobId ?? "")
        : ""
  )
  const [filters, setFilters] = useState({ ...emptyFilters })
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<string[]>([])
  const selectedCandidateSet = useMemo(
    () => new Set(selectedCandidateIds),
    [selectedCandidateIds]
  )
  const candidateValues = useMemo(
    () =>
      candidates.map((candidate) => ({
        candidate,
        company: candidate.currentCompany ?? "—",
        departments: candidate.departments.join(", ") || "—",
        email: candidate.email ?? "—",
        experience: candidate.experience ?? "—",
        name: candidate.name,
        phone: candidate.phone,
        source: candidate.source ?? "—",
        status: candidate.status,
      })),
    [candidates]
  )
  const options = useMemo(
    () =>
      Object.fromEntries(
        (Object.keys(emptyFilters) as FilterKey[]).map((key) => [
          key,
          uniqueFilterOptions(candidateValues.map((row) => row[key])),
        ])
      ) as Record<FilterKey, string[]>,
    [candidateValues]
  )
  const visibleCandidates = candidateValues.filter((row) =>
    (Object.keys(emptyFilters) as FilterKey[]).every((key) =>
      matchesColumnFilter(row[key], filters[key])
    )
  )
  const eligibleVisibleCandidateIds = visibleCandidates
    .filter(
      ({ candidate }) =>
        jobId && !candidate.activeApplicationJobIds.includes(jobId)
    )
    .map(({ candidate }) => candidate.id)
  const columns: Array<{ key: FilterKey; label: string }> = [
    { key: "name", label: "Name" },
    { key: "phone", label: "Phone" },
    { key: "email", label: "Email" },
    { key: "departments", label: "Departments" },
    { key: "company", label: "Company" },
    { key: "experience", label: "Experience" },
    { key: "source", label: "Source" },
    { key: "status", label: "Status" },
  ]

  function changeJob(nextJobId: string) {
    setJobId(nextJobId)
    setSelectedCandidateIds([])
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

      <FieldGroup>
        <Field>
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

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {selectedCandidateIds.length} selected. Filter any column, tick the
            candidates, then assign them together to this job.
          </p>
          <div className="flex gap-2">
            <Button
              disabled={!eligibleVisibleCandidateIds.length}
              onClick={() =>
                setSelectedCandidateIds((current) => [
                  ...new Set([...current, ...eligibleVisibleCandidateIds]),
                ])
              }
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
              Clear selection
            </Button>
          </div>
        </div>

        <div className="max-h-[32rem] overflow-auto rounded-xl border">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow>
                <TableHead className="w-12">Select</TableHead>
                {columns.map(({ key, label }) => (
                  <TableHead key={key}>{label}</TableHead>
                ))}
              </TableRow>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead />
                {columns.map(({ key, label }) => (
                  <TableHead key={key}>
                    <ExcelColumnFilter
                      label={label}
                      onApply={(selected) =>
                        setFilters((current) => ({
                          ...current,
                          [key]: selected,
                        }))
                      }
                      options={options[key]}
                      selected={filters[key]}
                    />
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {!jobId ? (
                <TableRow>
                  <TableCell
                    className="py-10 text-center text-muted-foreground"
                    colSpan={9}
                  >
                    Select an open job to choose candidates.
                  </TableCell>
                </TableRow>
              ) : visibleCandidates.length ? (
                visibleCandidates.map((row) => {
                  const alreadyAssigned =
                    row.candidate.activeApplicationJobIds.includes(jobId)
                  return (
                    <TableRow key={row.candidate.id}>
                      <TableCell>
                        <Checkbox
                          aria-label={`Select ${row.name}`}
                          checked={selectedCandidateSet.has(row.candidate.id)}
                          disabled={alreadyAssigned}
                          onCheckedChange={(checked) =>
                            setSelectedCandidateIds((current) =>
                              checked === true
                                ? [...new Set([...current, row.candidate.id])]
                                : current.filter(
                                    (id) => id !== row.candidate.id
                                  )
                            )
                          }
                        />
                      </TableCell>
                      {columns.map(({ key }) => (
                        <TableCell key={key}>
                          {key === "status" && alreadyAssigned
                            ? "Already assigned"
                            : row[key]}
                        </TableCell>
                      ))}
                    </TableRow>
                  )
                })
              ) : (
                <TableRow>
                  <TableCell
                    className="py-10 text-center text-muted-foreground"
                    colSpan={9}
                  >
                    No candidates match the selected filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <AssignmentSubmitButton
          disabled={!jobId || !selectedCandidateIds.length}
          selectedCount={selectedCandidateIds.length}
        />
      </FieldGroup>
    </form>
  )
}
