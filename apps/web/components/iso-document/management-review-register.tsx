"use client"

import type {
  ManagementReviewAction,
  ManagementReviewRecord,
} from "@workspace/db"
import {
  meetingReference,
  reviewActionReference,
  reviewToday,
} from "@workspace/db/management-review-domain"
import { StatusBadge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  SectionCard,
} from "@workspace/ui/components/card"
import { Field, FieldLabel } from "@workspace/ui/components/field"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import {
  OperationalTable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import Link from "next/link"
import { useId, useState } from "react"
import { DataDownloadButton } from "@/components/data-download-button"
import { MetricSummary, PageHeader } from "@/components/ui/golden-patterns"

export function ManagementReviewRegister({
  meetings,
  points,
  canManage,
  allRecords,
}: {
  meetings: ManagementReviewRecord[]
  points: ManagementReviewAction[]
  canManage: boolean
  allRecords: boolean
}) {
  const [view, setView] = useState("Pending"),
    prefix = useId(),
    today = reviewToday()
  const pending = points.filter((point) => point.status !== "Closed")
  const overdue = points.filter(
    (point) =>
      (point.status === "Open" || point.status === "In Progress") &&
      point.dueOn &&
      point.dueOn < today
  ).length
  const visible = points.filter(
    (point) =>
      view === "All" ||
      (view === "Pending"
        ? point.status !== "Closed"
        : point.status === "Closed")
  )
  return (
    <div className="grid min-w-0 gap-6">
      <MetricSummary
        scope={`${allRecords ? "All" : "Your accessible"} management reviews and actions · before table filters`}
        items={[
          { label: "Meetings", value: meetings.length, tone: "information" },
          { label: "Pending points", value: pending.length, tone: "warning" },
          {
            label: "Awaiting QA",
            value: points.filter((point) => point.status === "Completed")
              .length,
            tone: "warning",
          },
          {
            label: "Overdue work",
            value: overdue,
            tone: overdue ? "danger" : "information",
          },
        ]}
      />
      <PageHeader
        title="Management Review Meetings"
        description="Record review inputs, people and decisions. Follow pending points across every meeting until QA verifies closure."
        actions={
          <>
            {canManage ? (
              <Button asChild>
                <Link href="/iso-document/management-review/new">
                  New meeting
                </Link>
              </Button>
            ) : null}
            <Button asChild variant="outline">
              <Link href="#pending-points">Pending points</Link>
            </Button>
            <DataDownloadButton
              href="/iso-document/management-review/export.xlsx"
              label="Download Excel"
            />
          </>
        }
      />
      <SectionCard>
        <CardHeader>
          <CardTitle>Meetings and minutes</CardTitle>
          <CardDescription>
            QA approval locks minutes; follow-up points remain active
            separately.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OperationalTable
            excelFilters
            filterStorageKey="iso-management-review-meetings"
            containerClassName="max-h-[55vh] rounded-xl border"
            state={meetings.length ? "ready" : "empty"}
            stateTitle="No accessible meetings"
            stateDescription="Create a draft to record the first management review."
          >
            <TableHeader>
              <TableRow>
                {[
                  "Reference",
                  "Meeting",
                  "Date",
                  "Review period",
                  "Chair",
                  "Status",
                  "QA approval",
                  "Next review",
                ].map((label) => (
                  <TableHead key={label} data-filterable="true">
                    {label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {meetings.map((meeting) => (
                <TableRow key={meeting.id} data-row-id={meeting.id}>
                  <TableCell>
                    <Link
                      className="font-medium text-primary underline-offset-4 hover:underline"
                      href={`/iso-document/management-review/${meeting.id}`}
                    >
                      {meetingReference(meeting.number)}
                    </Link>
                  </TableCell>
                  <TableCell className="min-w-56 whitespace-normal">
                    {meeting.title}
                  </TableCell>
                  <TableCell>{meeting.heldOn}</TableCell>
                  <TableCell>
                    {meeting.periodStart && meeting.periodEnd
                      ? `${meeting.periodStart} to ${meeting.periodEnd}`
                      : "Not confirmed"}
                  </TableCell>
                  <TableCell>
                    {meeting.chairName ?? "Account not confirmed"}
                  </TableCell>
                  <TableCell>
                    <StatusBadge value={meeting.status} />
                  </TableCell>
                  <TableCell>{meeting.approvedBy ?? "Pending"}</TableCell>
                  <TableCell>{meeting.nextReviewOn ?? "Not planned"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </OperationalTable>
        </CardContent>
      </SectionCard>
      <SectionCard id="pending-points" className="scroll-mt-24">
        <CardHeader>
          <CardTitle>Points across all meetings</CardTitle>
          <CardDescription>
            Pending includes Open, In Progress and Completed awaiting QA. Open a
            point to record work or inspect its meeting discussions.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Field className="max-w-xs">
            <FieldLabel htmlFor={`${prefix}-view`}>Show points</FieldLabel>
            <NativeSelect
              id={`${prefix}-view`}
              value={view}
              onChange={(event) => setView(event.target.value)}
            >
              {["Pending", "Closed", "All"].map((value) => (
                <NativeSelectOption key={value} value={value}>
                  {value}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <OperationalTable
            excelFilters
            filterStorageKey="iso-management-review-points"
            containerClassName="max-h-[65vh] rounded-xl border"
            state={visible.length ? "ready" : "empty"}
            stateTitle="No points in this view"
            stateDescription="Raised points stay here across meetings until verified and closed."
          >
            <TableHeader>
              <TableRow>
                {[
                  "Point",
                  "Original meeting",
                  "Action",
                  "Department",
                  "Responsible staff",
                  "Priority",
                  "Target date",
                  "Status",
                  "Expected result",
                ].map((label) => (
                  <TableHead key={label} data-filterable="true">
                    {label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((point) => (
                <TableRow key={point.id} data-row-id={point.id}>
                  <TableCell>
                    <Link
                      className="font-medium text-primary underline-offset-4 hover:underline"
                      href={`/iso-document/management-review/actions/${point.id}`}
                    >
                      {reviewActionReference(point.number)}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Link
                      className="text-primary hover:underline"
                      href={`/iso-document/management-review/${point.originMeetingId}`}
                    >
                      {meetingReference(point.originMeetingNumber)}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-96 min-w-64 whitespace-normal">
                    {point.description}
                  </TableCell>
                  <TableCell>{point.department || "Not assigned"}</TableCell>
                  <TableCell>{point.ownerName ?? "Not assigned"}</TableCell>
                  <TableCell>
                    <StatusBadge
                      value={point.priority}
                      tone={
                        point.priority === "High"
                          ? "warning"
                          : point.priority === "Not assessed"
                            ? "inactive"
                            : "information"
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <span
                      data-tone={
                        (point.status === "Open" ||
                          point.status === "In Progress") &&
                        point.dueOn &&
                        point.dueOn < today
                          ? "danger"
                          : undefined
                      }
                    >
                      {point.dueOn ?? "Not set"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <StatusBadge value={point.status} />
                  </TableCell>
                  <TableCell className="max-w-80 min-w-56 whitespace-normal">
                    {point.expectedOutcome || "Not assessed"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </OperationalTable>
        </CardContent>
      </SectionCard>
    </div>
  )
}
