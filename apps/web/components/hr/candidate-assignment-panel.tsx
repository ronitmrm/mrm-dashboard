"use client"

import { useMemo, useState } from "react"
import Link from "next/link"

import type { RecruitmentCandidateRow, RecruitmentJobRow } from "@workspace/db"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Field, FieldLabel } from "@workspace/ui/components/field"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
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
import { Textarea } from "@workspace/ui/components/textarea"
import { FileText, MessageSquareText } from "lucide-react"

import { logCandidateEventAction } from "@/app/hr/actions"
import { CandidateAssignmentForm } from "@/components/hr/candidate-assignment-form"
import {
  ExcelColumnFilter,
  matchesColumnFilter,
  uniqueFilterOptions,
} from "@/components/hr/excel-column-filter"

type CandidateFilterKey =
  | "applications"
  | "company"
  | "departments"
  | "designation"
  | "email"
  | "experience"
  | "logs"
  | "name"
  | "phone"
  | "resume"
  | "source"
  | "status"

const emptyFilters: Record<CandidateFilterKey, string[] | null> = {
  applications: null,
  company: null,
  departments: null,
  designation: null,
  email: null,
  experience: null,
  logs: null,
  name: null,
  phone: null,
  resume: null,
  source: null,
  status: null,
}

function CandidateStatusBadge({ status }: { status: string }) {
  return <Badge variant="outline">{status}</Badge>
}

export function CandidatesTable({
  canWrite = false,
  candidates,
}: {
  canWrite?: boolean
  candidates: RecruitmentCandidateRow[]
}) {
  const [filters, setFilters] = useState({ ...emptyFilters })
  const [loggingCandidate, setLoggingCandidate] =
    useState<RecruitmentCandidateRow | null>(null)
  const rows = useMemo(
    () =>
      candidates.map((candidate) => ({
        applications: String(candidate.applicationCount),
        candidate,
        company: candidate.currentCompany ?? "—",
        designation: candidate.preferredDesignation ?? "—",
        departments: candidate.departments.join(", ") || "—",
        email: candidate.email ?? "—",
        experience: candidate.experience ?? "—",
        logs: String(candidate.eventCount),
        name: candidate.name,
        phone: candidate.phone,
        resume: candidate.hasResume
          ? (candidate.resumeFileName ?? "PDF")
          : "No resume",
        source: candidate.source ?? "—",
        status: candidate.status,
      })),
    [candidates]
  )
  const options = useMemo(
    () =>
      Object.fromEntries(
        (Object.keys(emptyFilters) as CandidateFilterKey[]).map((key) => [
          key,
          uniqueFilterOptions(rows.map((row) => row[key])),
        ])
      ) as Record<CandidateFilterKey, string[]>,
    [rows]
  )
  const visibleRows = rows.filter((row) =>
    (Object.keys(emptyFilters) as CandidateFilterKey[]).every((key) =>
      matchesColumnFilter(row[key], filters[key])
    )
  )
  const columns: Array<{ key: CandidateFilterKey; label: string }> = [
    { key: "name", label: "Name" },
    { key: "phone", label: "Phone" },
    { key: "email", label: "Email" },
    { key: "departments", label: "Departments" },
    { key: "designation", label: "Designation" },
    { key: "company", label: "Company" },
    { key: "experience", label: "Experience" },
    { key: "source", label: "Source" },
    { key: "applications", label: "Applications" },
    { key: "logs", label: "Logs" },
    { key: "resume", label: "Resume" },
    { key: "status", label: "Status" },
  ]

  return (
    <Sheet
      onOpenChange={(open) => {
        if (!open) setLoggingCandidate(null)
      }}
      open={loggingCandidate !== null}
    >
    <Card>
      <CardHeader>
        <CardTitle>Candidates</CardTitle>
        <CardDescription>
          Showing {visibleRows.length} of {candidates.length} candidate profiles
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map(({ key, label }) => (
                <TableHead key={key}>{label}</TableHead>
              ))}
              {canWrite ? <TableHead className="text-right">Actions</TableHead> : null}
            </TableRow>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              {columns.map(({ key, label }) => (
                <TableHead key={key}>
                  <ExcelColumnFilter
                    label={label}
                    onApply={(selected) =>
                      setFilters((current) => ({ ...current, [key]: selected }))
                    }
                    options={options[key]}
                    selected={filters[key]}
                  />
                </TableHead>
              ))}
              {canWrite ? <TableHead /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleRows.map((row) => (
              <TableRow key={row.candidate.id}>
                <TableCell>
                  <Button asChild className="h-auto p-0" variant="link">
                    <Link href={`/hr/candidates/${row.candidate.id}`}>
                      {row.name}
                    </Link>
                  </Button>
                </TableCell>
                <TableCell className="font-mono">{row.phone}</TableCell>
                <TableCell>{row.email}</TableCell>
                <TableCell>{row.departments}</TableCell>
                <TableCell>{row.designation}</TableCell>
                <TableCell>{row.company}</TableCell>
                <TableCell>{row.experience}</TableCell>
                <TableCell>{row.source}</TableCell>
                <TableCell>{row.applications}</TableCell>
                <TableCell>{row.logs}</TableCell>
                <TableCell>
                  {row.candidate.hasResume ? (
                    <Button asChild size="sm" variant="outline">
                      <a
                        href={`/hr/candidates/${row.candidate.id}/resume`}
                        rel="noreferrer"
                        target="_blank"
                      >
                        <FileText data-icon="inline-start" />
                        Resume
                      </a>
                    </Button>
                  ) : (
                    "No resume"
                  )}
                </TableCell>
                <TableCell>
                  <CandidateStatusBadge status={row.status} />
                </TableCell>
                {canWrite ? (
                  <TableCell className="text-right">
                    <Button
                      onClick={() => setLoggingCandidate(row.candidate)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      <MessageSquareText data-icon="inline-start" />
                      Log conversation
                    </Button>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
            {!visibleRows.length ? (
              <TableRow>
                <TableCell
                  className="py-10 text-center text-muted-foreground"
                  colSpan={canWrite ? 13 : 12}
                >
                  No candidates match the selected filters.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
    {loggingCandidate ? (
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <form action={logCandidateEventAction} className="flex min-h-full flex-col">
          <input name="panel" type="hidden" value="candidatesPanel" />
          <input name="candidate_id" type="hidden" value={loggingCandidate.id} />
          <SheetHeader>
            <SheetTitle>Log conversation</SheetTitle>
            <SheetDescription>
              {loggingCandidate.name} · {loggingCandidate.phone}
            </SheetDescription>
          </SheetHeader>
          <div className="grid flex-1 content-start gap-4 px-6">
            <Field>
              <FieldLabel htmlFor="candidate-log-event-type">Conversation type</FieldLabel>
              <NativeSelect id="candidate-log-event-type" name="event_type" required>
                {["Phone Call", "WhatsApp", "Email", "In Person", "Interview Follow-up", "Offer / Joining", "Other"].map((option) => (
                  <NativeSelectOption key={option} value={option}>{option}</NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor="candidate-log-title">Conversation field</FieldLabel>
              <NativeSelect id="candidate-log-title" name="title" required>
                {["Initial Contact", "Follow-up", "Interview Scheduling", "Document Request", "Salary Discussion", "Offer Discussion", "Joining Confirmation", "Not Interested", "Other"].map((option) => (
                  <NativeSelectOption key={option} value={option}>{option}</NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor="candidate-log-notes">Notes</FieldLabel>
              <Textarea id="candidate-log-notes" name="notes" rows={8} />
            </Field>
          </div>
          <SheetFooter>
            <Button type="submit">Add to candidate timeline</Button>
          </SheetFooter>
        </form>
      </SheetContent>
    ) : null}
    </Sheet>
  )
}

export function CandidateAssignmentPanel({
  canWrite,
  candidates,
  fixedJob,
  initialJobId,
  jobs = [],
  returnJobId,
}: {
  canWrite: boolean
  candidates: RecruitmentCandidateRow[]
  fixedJob?: Pick<RecruitmentJobRow, "id" | "title" | "vacancyCode">
  initialJobId?: string
  jobs?: RecruitmentJobRow[]
  returnJobId?: string
}) {
  if (!canWrite) return <CandidatesTable candidates={candidates} />

  return (
    <Card>
          <CardHeader>
            <CardTitle>Search candidates for a job</CardTitle>
            <CardDescription>
              Select one job first, use the column filters to find suitable
              candidates, then tick one or many candidates for that job.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CandidateAssignmentForm
              candidates={candidates.map((candidate) => ({
                activeApplicationJobIds: candidate.activeApplicationJobIds,
                currentCompany: candidate.currentCompany,
                departments: candidate.departments,
                email: candidate.email,
                experience: candidate.experience,
                id: candidate.id,
                name: candidate.name,
                phone: candidate.phone,
                source: candidate.source,
                status: candidate.status,
              }))}
              fixedJob={fixedJob}
              initialJobId={initialJobId}
              jobs={jobs
                .filter((job) => job.status === "Open")
                .map((job) => ({
                  id: job.id,
                  title: job.title,
                  vacancyCode: job.vacancyCode,
                }))}
              returnJobId={returnJobId}
            />
          </CardContent>
    </Card>
  )
}
