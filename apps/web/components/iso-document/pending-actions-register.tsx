"use client"
import Link from "next/link"
import { useState } from "react"
import type { IsoPendingTask } from "@workspace/db"
import { isoModules, isoToday } from "@workspace/db/iso-workflow-domain"
import { StatusBadge } from "@workspace/ui/components/badge"
import { Tabs, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import {
  OperationalTable,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "@workspace/ui/components/table"
import { MetricSummary } from "@/components/ui/golden-patterns"

export function PendingActionsRegister({
  rows,
  userId,
}: {
  rows: IsoPendingTask[]
  userId: string
}) {
  const [view, setView] = useState("all"),
    today = isoToday()
  const overdue = (row: IsoPendingTask) =>
    Boolean(row.dueOn && row.dueOn < today && row.status !== "Closed")
  const shown = rows.filter((row) =>
    view === "mine"
      ? row.ownerUserId === userId
      : view === "qa"
        ? row.status === "Awaiting QA"
        : view === "overdue"
          ? overdue(row)
          : true
  )
  return (
    <div className="grid min-w-0 gap-5">
      <MetricSummary
        scope="All permitted pending work · before table filters"
        items={[
          { label: "Pending", value: rows.length, tone: "warning" },
          {
            label: "My actions",
            value: rows.filter((row) => row.ownerUserId === userId).length,
            tone: "information",
          },
          {
            label: "Awaiting QA",
            value: rows.filter((row) => row.status === "Awaiting QA").length,
            tone: "accent",
          },
          {
            label: "Overdue",
            value: rows.filter(overdue).length,
            tone: "danger",
          },
        ]}
      />
      <Tabs value={view} onValueChange={setView} className="min-w-0">
        <div className="min-w-0 overflow-x-auto">
          <TabsList>
            <TabsTrigger value="all">All Pending</TabsTrigger>
            <TabsTrigger value="mine">My Actions</TabsTrigger>
            <TabsTrigger value="qa">Awaiting QA</TabsTrigger>
            <TabsTrigger value="overdue">Overdue</TabsTrigger>
          </TabsList>
        </div>
      </Tabs>
      <OperationalTable
        key={view}
        filterStorageKey={`iso:pending-actions:${view}`}
        containerClassName="max-h-[68vh] rounded-lg border"
        toolbarStart={
          <span className="text-sm font-medium">
            Department-wise pending work
          </span>
        }
        state={shown.length ? "ready" : "empty"}
        stateTitle="No pending work"
        stateDescription="Assigned work, QA reviews and due obligations appear here."
      >
        <TableHeader>
          <TableRow>
            {[
              "Department",
              "Responsible person",
              "Target date",
              "Status",
              "Module",
              "Reference",
              "Task",
              "Master document",
              "Workflow",
              "Open",
            ].map((label) => (
              <TableHead key={label}>{label}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {shown.map((row) => (
            <TableRow key={row.key} data-row-id={row.key}>
              <TableCell>{row.department || "Not assigned"}</TableCell>
              <TableCell>{row.ownerName || "Not assigned"}</TableCell>
              <TableCell>
                {row.dueOn || "Not set"}
                {overdue(row) ? <StatusBadge value="Overdue" /> : null}
              </TableCell>
              <TableCell>
                <StatusBadge value={row.status} />
              </TableCell>
              <TableCell>
                {row.module ? isoModules[row.module].label : "Document control"}
              </TableCell>
              <TableCell>{row.reference}</TableCell>
              <TableCell className="max-w-sm whitespace-normal">
                {row.title}
              </TableCell>
              <TableCell>
                <Link
                  className="text-primary hover:underline"
                  href={`/iso-document/documents/${row.documentId}`}
                >
                  {row.documentTitle}
                </Link>
              </TableCell>
              <TableCell>
                <Link
                  className="text-primary hover:underline"
                  href={`/iso-document/documents/${row.documentId}/workflow`}
                >
                  Task Workflow
                </Link>
              </TableCell>
              <TableCell>
                <Link
                  className="text-primary hover:underline"
                  href={`/iso-document/pending-actions/${encodeURIComponent(row.key)}`}
                >
                  Open Task
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </OperationalTable>
    </div>
  )
}
