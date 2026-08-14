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
import { Pencil, Trash2 } from "lucide-react"

import {
  deleteCandidateEventAction,
  updateCandidateEventAction,
} from "@/app/hr/actions"
import {
  ExcelColumnFilter,
  matchesColumnFilter,
  uniqueFilterOptions,
} from "@workspace/ui/components/excel-column-filter"

type FilterKey =
  | "candidate"
  | "date"
  | "department"
  | "job"
  | "notes"
  | "phone"
  | "title"
  | "type"

const emptyFilters: Record<FilterKey, string[] | null> = {
  candidate: null,
  date: null,
  department: null,
  job: null,
  notes: null,
  phone: null,
  title: null,
  type: null,
}

const conversationTypes = [
  "Phone Call",
  "WhatsApp",
  "Email",
  "In Person",
  "Interview Follow-up",
  "Offer / Joining",
  "Other",
] as const

const conversationFields = [
  "Initial Contact",
  "Follow-up",
  "Interview Scheduling",
  "Document Request",
  "Salary Discussion",
  "Offer Discussion",
  "Joining Confirmation",
  "Not Interested",
  "Other",
] as const

export function ConversationLogsTable({
  canWrite = false,
  events,
  returnCandidateId,
  showCandidate = true,
  title = "Conversation logs",
}: {
  canWrite?: boolean
  events: RecruitmentCandidateEventRow[]
  returnCandidateId?: string
  showCandidate?: boolean
  title?: string
}) {
  const [editingEvent, setEditingEvent] =
    useState<RecruitmentCandidateEventRow | null>(null)
  const [filters, setFilters] = useState({ ...emptyFilters })
  const rows = useMemo(
    () =>
      events.map((event) => ({
        candidate: event.candidateName,
        date: new Date(event.occurredAt).toLocaleString("en-IN"),
        department: event.department ?? "—",
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
    ["department", "Department"],
    ["type", "Type"],
    ["title", "Field"],
    ["notes", "Notes"],
    ["job", "Job"],
    ["date", "Date and time"],
  ] as Array<[FilterKey, string]>
  const columnCount = columns.length + (canWrite ? 1 : 0)

  return (
    <Sheet
      onOpenChange={(open) => {
        if (!open) setEditingEvent(null)
      }}
      open={editingEvent !== null}
    >
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>
            Showing {visibleRows.length} Of {events.length} Timestamped Logs
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map(([key, label]) => (
                  <TableHead key={key}>{label}</TableHead>
                ))}
                {canWrite ? (
                  <TableHead className="text-right">Actions</TableHead>
                ) : null}
              </TableRow>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                {columns.map(([key, label]) => (
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
                {canWrite ? <TableHead /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleRows.map((row) => (
                <TableRow key={row.event.id}>
                  {showCandidate ? (
                    <>
                      <TableCell>
                        <Button asChild className="h-auto p-0" variant="link">
                          <Link
                            href={`/hr/candidates/${row.event.candidateId}`}
                          >
                            {row.candidate}
                          </Link>
                        </Button>
                      </TableCell>
                      <TableCell className="font-mono">{row.phone}</TableCell>
                    </>
                  ) : null}
                  <TableCell>{row.department}</TableCell>
                  <TableCell>{row.type}</TableCell>
                  <TableCell>{row.title}</TableCell>
                  <TableCell className="max-w-lg whitespace-normal">
                    {row.notes}
                  </TableCell>
                  <TableCell className="font-mono">{row.job}</TableCell>
                  <TableCell>{row.date}</TableCell>
                  {canWrite ? (
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button
                          aria-label={`Edit log for ${row.candidate}`}
                          onClick={() => setEditingEvent(row.event)}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          <Pencil data-icon="inline-start" />
                          Edit
                        </Button>
                        <form
                          action={deleteCandidateEventAction}
                          onSubmit={(event) => {
                            if (
                              !window.confirm(
                                "Delete this conversation log? It will be removed from the candidate history."
                              )
                            ) {
                              event.preventDefault()
                            }
                          }}
                        >
                          <input
                            name="panel"
                            type="hidden"
                            value="conversationLogsPanel"
                          />
                          {returnCandidateId ? (
                            <input
                              name="return_candidate_id"
                              type="hidden"
                              value={returnCandidateId}
                            />
                          ) : null}
                          <input
                            name="event_id"
                            type="hidden"
                            value={row.event.id}
                          />
                          <Button
                            aria-label={`Delete log for ${row.candidate}`}
                            size="sm"
                            type="submit"
                            variant="destructive"
                          >
                            <Trash2 data-icon="inline-start" />
                            Delete
                          </Button>
                        </form>
                      </div>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
              {!visibleRows.length ? (
                <TableRow>
                  <TableCell
                    className="py-10 text-center text-muted-foreground"
                    colSpan={columnCount}
                  >
                    No Conversation Logs Match The Selected Filters.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {editingEvent ? (
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <form
            action={updateCandidateEventAction}
            className="flex min-h-full flex-col"
          >
            <input name="panel" type="hidden" value="conversationLogsPanel" />
            {returnCandidateId ? (
              <input
                name="return_candidate_id"
                type="hidden"
                value={returnCandidateId}
              />
            ) : null}
            <input name="event_id" type="hidden" value={editingEvent.id} />
            <SheetHeader>
              <SheetTitle>Edit Conversation Log</SheetTitle>
              <SheetDescription>
                Update The Type, Field, Or Notes. The Original Date And Time
                Remain Unchanged.
              </SheetDescription>
            </SheetHeader>
            <div className="grid flex-1 content-start gap-4 px-6">
              <Field>
                <FieldLabel htmlFor="edit-conversation-type">Type</FieldLabel>
                <NativeSelect
                  className="w-full"
                  defaultValue={editingEvent.eventType}
                  id="edit-conversation-type"
                  name="event_type"
                  required
                >
                  {!conversationTypes.includes(
                    editingEvent.eventType as (typeof conversationTypes)[number]
                  ) ? (
                    <NativeSelectOption value={editingEvent.eventType}>
                      {editingEvent.eventType}
                    </NativeSelectOption>
                  ) : null}
                  {conversationTypes.map((option) => (
                    <NativeSelectOption key={option} value={option}>
                      {option}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel htmlFor="edit-conversation-field">Field</FieldLabel>
                <NativeSelect
                  className="w-full"
                  defaultValue={editingEvent.title}
                  id="edit-conversation-field"
                  name="title"
                  required
                >
                  {!conversationFields.includes(
                    editingEvent.title as (typeof conversationFields)[number]
                  ) ? (
                    <NativeSelectOption value={editingEvent.title}>
                      {editingEvent.title}
                    </NativeSelectOption>
                  ) : null}
                  {conversationFields.map((option) => (
                    <NativeSelectOption key={option} value={option}>
                      {option}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel htmlFor="edit-conversation-notes">Notes</FieldLabel>
                <Textarea
                  defaultValue={editingEvent.notes ?? ""}
                  id="edit-conversation-notes"
                  name="notes"
                  rows={8}
                />
              </Field>
            </div>
            <SheetFooter>
              <Button type="submit">Save Log Changes</Button>
            </SheetFooter>
          </form>
        </SheetContent>
      ) : null}
    </Sheet>
  )
}
