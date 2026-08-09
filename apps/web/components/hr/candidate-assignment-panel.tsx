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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { FileText } from "lucide-react"

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
  candidates,
}: {
  candidates: RecruitmentCandidateRow[]
}) {
  const [filters, setFilters] = useState({ ...emptyFilters })
  const rows = useMemo(
    () =>
      candidates.map((candidate) => ({
        applications: String(candidate.applicationCount),
        candidate,
        company: candidate.currentCompany ?? "—",
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
    { key: "company", label: "Company" },
    { key: "experience", label: "Experience" },
    { key: "source", label: "Source" },
    { key: "applications", label: "Applications" },
    { key: "logs", label: "Logs" },
    { key: "resume", label: "Resume" },
    { key: "status", label: "Status" },
  ]

  return (
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
              </TableRow>
            ))}
            {!visibleRows.length ? (
              <TableRow>
                <TableCell
                  className="py-10 text-center text-muted-foreground"
                  colSpan={11}
                >
                  No candidates match the selected filters.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

export function CandidateAssignmentPanel({
  canWrite,
  candidates,
  fixedJob,
  initialJobId,
  jobs = [],
}: {
  canWrite: boolean
  candidates: RecruitmentCandidateRow[]
  fixedJob?: Pick<RecruitmentJobRow, "id" | "title" | "vacancyCode">
  initialJobId?: string
  jobs?: RecruitmentJobRow[]
}) {
  return (
    <>
      {canWrite ? (
        <Card>
          <CardHeader>
            <CardTitle>Assign candidates</CardTitle>
            <CardDescription>
              Choose one job, filter the candidate table by any column, and
              assign multiple candidates in one action.
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
            />
          </CardContent>
        </Card>
      ) : null}
      <CandidatesTable candidates={candidates} />
    </>
  )
}
