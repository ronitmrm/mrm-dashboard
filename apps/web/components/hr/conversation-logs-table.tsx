"use client"

import { useMemo, useState } from "react"
import Link from "next/link"

import type { RecruitmentCandidateEventRow } from "@workspace/db"
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

import {
  ExcelColumnFilter,
  matchesColumnFilter,
  uniqueFilterOptions,
} from "@/components/hr/excel-column-filter"

type FilterKey =
  | "candidate"
  | "date"
  | "job"
  | "notes"
  | "phone"
  | "title"
  | "type"

const emptyFilters: Record<FilterKey, string[] | null> = {
  candidate: null,
  date: null,
  job: null,
  notes: null,
  phone: null,
  title: null,
  type: null,
}

export function ConversationLogsTable({
  events,
  showCandidate = true,
  title = "Conversation logs",
}: {
  events: RecruitmentCandidateEventRow[]
  showCandidate?: boolean
  title?: string
}) {
  const [filters, setFilters] = useState({ ...emptyFilters })
  const rows = useMemo(
    () =>
      events.map((event) => ({
        candidate: event.candidateName,
        date: new Date(event.occurredAt).toLocaleString("en-IN"),
        event,
        job: event.jobNumber ?? "—",
        notes: event.notes ?? "—",
        phone: event.candidatePhone,
        title: event.title,
        type: event.eventType,
      })),
    [events]
  )
  const options = useMemo(
    () =>
      Object.fromEntries(
        (Object.keys(emptyFilters) as FilterKey[]).map((key) => [
          key,
          uniqueFilterOptions(rows.map((row) => row[key])),
        ])
      ) as Record<FilterKey, string[]>,
    [rows]
  )
  const activeKeys = (Object.keys(emptyFilters) as FilterKey[]).filter(
    (key) => showCandidate || (key !== "candidate" && key !== "phone")
  )
  const visibleRows = rows.filter((row) =>
    activeKeys.every((key) => matchesColumnFilter(row[key], filters[key]))
  )
  const columns = [
    ...(showCandidate
      ? [
          ["candidate", "Candidate"],
          ["phone", "Phone"],
        ]
      : []),
    ["type", "Type"],
    ["title", "Field"],
    ["notes", "Notes"],
    ["job", "Job"],
    ["date", "Date and time"],
  ] as Array<[FilterKey, string]>

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          Showing {visibleRows.length} of {events.length} timestamped logs
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map(([key, label]) => (
                <TableHead key={key}>{label}</TableHead>
              ))}
            </TableRow>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              {columns.map(([key, label]) => (
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
              <TableRow key={row.event.id}>
                {showCandidate ? (
                  <>
                    <TableCell>
                      <Button asChild className="h-auto p-0" variant="link">
                        <Link href={`/hr/candidates/${row.event.candidateId}`}>
                          {row.candidate}
                        </Link>
                      </Button>
                    </TableCell>
                    <TableCell className="font-mono">{row.phone}</TableCell>
                  </>
                ) : null}
                <TableCell>{row.type}</TableCell>
                <TableCell>{row.title}</TableCell>
                <TableCell className="max-w-lg whitespace-normal">
                  {row.notes}
                </TableCell>
                <TableCell className="font-mono">{row.job}</TableCell>
                <TableCell>{row.date}</TableCell>
              </TableRow>
            ))}
            {!visibleRows.length ? (
              <TableRow>
                <TableCell
                  className="py-10 text-center text-muted-foreground"
                  colSpan={columns.length}
                >
                  No conversation logs match the selected filters.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
