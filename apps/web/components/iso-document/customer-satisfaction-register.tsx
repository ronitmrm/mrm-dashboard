"use client"
import Link from "next/link"
import { useState } from "react"
import type { SatisfactionReport } from "@workspace/db"
import { analysisToday } from "@workspace/db/iso-analysis-domain"
import { StatusBadge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Tabs, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import {
  OperationalTable,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "@workspace/ui/components/table"
import { PageHeader, MetricSummary } from "@/components/ui/golden-patterns"
import { DataDownloadButton } from "@/components/data-download-button"
export function SatisfactionRegister({
  rows,
  canManage,
  canReadAll,
}: {
  rows: SatisfactionReport[]
  canManage: boolean
  canReadAll: boolean
}) {
  const [view, setView] = useState("all")
  const today = analysisToday()
  const pending = (row: SatisfactionReport) =>
    row.fields.followUpRequired &&
    (!row.fields.analysisId || row.actionStatus !== "Closed")
  const due = (row: SatisfactionReport) =>
    Boolean(row.fields.nextReviewOn && row.fields.nextReviewOn <= today)
  const visible = rows.filter((row) =>
    view === "pending"
      ? pending(row)
      : view === "qa"
        ? row.status === "Submitted"
        : view === "due"
          ? due(row)
          : true
  )
  return (
    <div className="grid min-w-0 gap-6">
      <PageHeader
        title="Customer Satisfaction Reports"
        description="Store the original reports, review customer perceptions and trends, and track follow-up work through QA verification."
        actions={
          <>
            <DataDownloadButton href="/iso-document/customer-satisfaction/export.xlsx" />
            {canManage ? (
              <Button asChild>
                <Link href="/iso-document/customer-satisfaction/new">
                  New Report
                </Link>
              </Button>
            ) : null}
          </>
        }
      />
      <MetricSummary
        scope={`${canReadAll ? "All permitted reports" : "Your assigned reports"} · before table filters`}
        items={[
          { label: "Reports", value: rows.length, tone: "information" },
          {
            label: "Awaiting QA",
            value: rows.filter((x) => x.status === "Submitted").length,
            tone: "warning",
          },
          {
            label: "Pending Follow-up",
            value: rows.filter(pending).length,
            tone: "warning",
          },
          {
            label: "Reviews Due",
            value: rows.filter(due).length,
            tone: "warning",
          },
        ]}
      />
      <Tabs value={view} onValueChange={setView}>
        <TabsList className="flex h-auto w-fit flex-wrap">
          <TabsTrigger value="all">All Reports</TabsTrigger>
          <TabsTrigger value="pending">Pending Follow-up</TabsTrigger>
          <TabsTrigger value="qa">Awaiting QA</TabsTrigger>
          <TabsTrigger value="due">Reviews Due</TabsTrigger>
        </TabsList>
      </Tabs>
      <OperationalTable
        excelFilters
        filterStorageKey={`iso-satisfaction-${view}`}
        containerClassName="max-h-[65vh] rounded-xl border"
        state={visible.length ? "ready" : "empty"}
        stateTitle="No matching reports"
        stateDescription="Reports and their follow-up work appear here."
      >
        <TableHeader>
          <TableRow>
            {[
              "Report",
              "Customer / Scope",
              "Period",
              "Method",
              "Result / Scale",
              "Trend",
              "Responsible Staff",
              "Status",
              "Report File",
              "Follow-up",
              "Next Review",
            ].map((label) => (
              <TableHead key={label}>{label}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.map((row) => (
            <TableRow key={row.id}>
              <TableCell>
                <Link
                  className="underline"
                  href={`/iso-document/customer-satisfaction/${row.id}`}
                >
                  CS-{String(row.number).padStart(5, "0")} · {row.fields.title}
                </Link>
              </TableCell>
              <TableCell>
                {row.customerName ?? row.fields.customerScope ?? "Needs scope"}
              </TableCell>
              <TableCell>
                {row.fields.periodFrom ?? "Not set"} –{" "}
                {row.fields.periodTo ?? "Not set"}
              </TableCell>
              <TableCell className="max-w-72 min-w-48 whitespace-normal">
                {row.fields.method || "Not recorded"}
              </TableCell>
              <TableCell className="max-w-72 min-w-48 whitespace-normal">
                {row.fields.result || "See original report"}
              </TableCell>
              <TableCell className="max-w-72 min-w-48 whitespace-normal">
                {row.fields.trend || "Not reviewed"}
              </TableCell>
              <TableCell>{row.ownerName ?? "Unassigned"}</TableCell>
              <TableCell>
                <StatusBadge value={row.status} />
              </TableCell>
              <TableCell>
                {row.fileCount ? "Uploaded" : "Awaiting upload"}
              </TableCell>
              <TableCell>
                {row.fields.followUpRequired
                  ? `${row.actionReference ?? "Action not linked"} · ${row.actionStatus ?? "Pending"}`
                  : "No follow-up required"}
              </TableCell>
              <TableCell>
                {row.fields.nextReviewOn ?? "Not set"}
                {due(row) ? (
                  <StatusBadge value="Review due" tone="warning" />
                ) : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </OperationalTable>
    </div>
  )
}
