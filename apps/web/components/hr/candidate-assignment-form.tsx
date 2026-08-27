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
import { useExcelTable } from "@workspace/ui/hooks/use-excel-table"

import { assignCandidateAction } from "@/app/hr/actions"
import { ExcelColumnFilter } from "@workspace/ui/components/excel-column-filter"

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
        ? "Assigning Candidates…"
        : `Assign ${selectedCount || "selected"} candidate${selectedCount === 1 ? "" : "s"} to job`}
    </Button>
  )
}

export function CandidateAssignmentForm({
  candidates,
  fixedJob,
  initialJobId,
  jobs,
  returnJobId,
}: {
  candidates: CandidateOption[]
  fixedJob?: JobOption
  initialJobId?: string
  jobs: JobOption[]
  returnJobId?: string
}) {
  const fieldId = useId()
  const [jobId, setJobId] = useState(() =>
    fixedJob
      ? fixedJob.id
      : jobs.some((job) => job.id === initialJobId)
        ? (initialJobId ?? "")
        : ""
  )
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
  const table = useExcelTable({
    rows: candidateValues,
    columns: columns.map(({ key, label }) => ({
      key,
      label,
      values: (row: (typeof candidateValues)[number]) => [row[key]],
    })),
  })
  const visibleCandidates = table.visibleRows
  const eligibleVisibleCandidateIds = visibleCandidates
    .filter(
      ({ candidate }) =>
        jobId && !candidate.activeApplicationJobIds.includes(jobId)
    )
    .map(({ candidate }) => candidate.id)

  function changeJob(nextJobId: string) {
    setJobId(nextJobId)
    setSelectedCandidateIds([])
  }

  return (
    <form action={assignCandidateAction}>
      {fixedJob || returnJobId ? (
        <input
          name="return_job_id"
          type="hidden"
          value={fixedJob?.id ?? returnJobId}
        />
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
          <FieldLabel htmlFor={`${fieldId}-job`}>Open Job</FieldLabel>
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
              <NativeSelectOption value="">Select Job</NativeSelectOption>
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
            {selectedCandidateIds.length} Selected. Filter Any Column, Tick The
            Candidates, Then Assign Them Together To This Job.
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
              Select All Shown
            </Button>
            <Button
              disabled={!selectedCandidateIds.length}
              onClick={() => setSelectedCandidateIds([])}
              size="sm"
              type="button"
              variant="ghost"
            >
              Clear Selection
            </Button>
            <Button
              disabled={!table.hasFilters}
              onClick={table.clearFilters}
              size="sm"
              type="button"
              variant="outline"
            >
              Clear All Filters
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
                      {...table.filterProps(key)}
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
                    Select An Open Job To Choose Candidates.
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
                            ? "Already Assigned"
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
                    No Candidates Match The Selected Filters.
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
