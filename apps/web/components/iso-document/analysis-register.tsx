"use client"

import type { AnalysisRecord } from "@workspace/db"
import {
  analysisReference,
  analysisToday,
  analysisStatusLabel,
  type AnalysisKind,
} from "@workspace/db/iso-analysis-domain"
import { StatusBadge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { SectionCard, CardContent } from "@workspace/ui/components/card"
import { Dialog, DialogTrigger } from "@workspace/ui/components/dialog"
import {
  OperationalTable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import Link from "next/link"
import { useState } from "react"
import { Tabs, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import { riskScore } from "@workspace/db/risk-thinking-domain"
import { DataDownloadButton } from "@/components/data-download-button"
import { MasterDataCsvImportButton } from "@/components/master-data-csv-import-button"
import {
  MetricSummary,
  PageHeader,
  StandardDialogContent,
} from "@/components/ui/golden-patterns"
import { importAnalysisAction } from "@/app/iso-document/analysis/actions"
import { AnalysisMetadataForm } from "./analysis-forms"

export function AnalysisRegister({
  kind,
  rows,
  owners,
  canManage,
  canReadAll,
}: {
  kind: AnalysisKind
  rows: AnalysisRecord[]
  owners: Array<{ id: string; name: string }>
  canManage: boolean
  canReadAll: boolean
}) {
  const [creating, setCreating] = useState(false)
  const [importSummary, setImportSummary] = useState("")
  const [view, setView] = useState("all")
  const today = analysisToday()
  const path = `/iso-document/analysis/${kind.toLowerCase()}`
  const overdue = (row: AnalysisRecord) =>
    row.riskState !== "Retired" &&
    (row.status === "Open" || row.status === "In Progress") &&
    Boolean(row.dueOn && row.dueOn < today)
  const reviewDue = (row: AnalysisRecord) =>
    row.riskState !== "Retired" &&
    Boolean(row.nextReviewOn && row.nextReviewOn <= today)
  const visible =
    kind === "RISK"
      ? rows.filter((row) =>
          view === "pending"
            ? row.riskState !== "Retired" && row.status !== "Closed"
            : view === "due"
              ? reviewDue(row)
              : view === "retired"
                ? row.riskState === "Retired"
                : true
        )
      : rows
  return (
    <div className="grid min-w-0 gap-6">
      <MetricSummary
        scope={`${canReadAll ? "All" : "Your assigned"} ${kind} items · before table filters`}
        items={[
          { label: "Items", value: rows.length, tone: "information" },
          {
            label: "Open Work",
            value: rows.filter(
              (row) =>
                row.riskState !== "Retired" &&
                (row.status === "Open" || row.status === "In Progress")
            ).length,
            tone: "warning",
          },
          {
            label: "Awaiting QA",
            value: rows.filter(
              (row) => row.riskState !== "Retired" && row.status === "Completed"
            ).length,
            tone: "warning",
          },
          {
            label: kind === "RISK" ? "Monitoring" : "Closed",
            value: rows.filter(
              (row) => row.riskState !== "Retired" && row.status === "Closed"
            ).length,
            tone: "inactive",
          },
          {
            label: "Overdue Work",
            value: rows.filter(overdue).length,
            tone: rows.some(overdue) ? "danger" : "information",
          },
          {
            label: "Reviews Due",
            value: rows.filter(reviewDue).length,
            tone: "warning",
          },
        ]}
      />
      <PageHeader
        title={kind === "RISK" ? "Risk-Based Thinking" : `${kind} Analysis`}
        description={
          kind === "RISK"
            ? "Assess process risks, assign treatment, verify control effectiveness and monitor remaining risk. Completing work keeps ongoing risks under review."
            : "Assign actions, record work and evidence, then obtain QA verification to close. Open an item for its complete history."
        }
        actions={
          <>
            <p className="text-sm text-muted-foreground">
              Document No.{" "}
              {kind === "RISK"
                ? "MRM-QA-027"
                : kind === "PEST"
                  ? "MRM-QA-021-01"
                  : "MRM-QA-022-01"}
            </p>
            <DataDownloadButton href={`${path}/export.xlsx`} />
            {canManage ? (
              <>
                <MasterDataCsvImportButton
                  accept=".xlsx"
                  label="Import Excel"
                  fileField="analysis_file"
                  fields={{ kind }}
                  successMessage={importSummary}
                  action={async (data) => {
                    const result = await importAnalysisAction(data)
                    if ("error" in result) return { error: result.error }
                    setImportSummary(
                      `${result.added} items imported; ${result.skipped} existing items skipped. Saved work retained.`
                    )
                  }}
                />
                <Dialog open={creating} onOpenChange={setCreating}>
                  <DialogTrigger asChild>
                    <Button>
                      {kind === "RISK" ? "New Risk" : `New ${kind} Item`}
                    </Button>
                  </DialogTrigger>
                  <StandardDialogContent
                    title={kind === "RISK" ? "New Risk" : `New ${kind} Item`}
                    className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"
                  >
                    <AnalysisMetadataForm kind={kind} owners={owners} />
                  </StandardDialogContent>
                </Dialog>
              </>
            ) : null}
          </>
        }
      />
      {kind === "RISK" ? (
        <Tabs value={view} onValueChange={setView}>
          <TabsList className="flex h-auto w-fit flex-wrap">
            <TabsTrigger value="all">All Risks</TabsTrigger>
            <TabsTrigger value="pending">Pending Actions</TabsTrigger>
            <TabsTrigger value="due">Reviews Due</TabsTrigger>
            <TabsTrigger value="retired">Retired</TabsTrigger>
          </TabsList>
        </Tabs>
      ) : null}
      <SectionCard>
        <CardContent>
          <OperationalTable
            excelFilters
            filterStorageKey={`iso-analysis-${kind}-${view}`}
            containerClassName="max-h-[70vh] rounded-xl border"
            state={visible.length ? "ready" : "empty"}
            stateTitle={`No ${kind} items`}
            stateDescription={
              canManage
                ? "Create an item or import your analysis workbook."
                : "Items assigned to you will appear here."
            }
          >
            <TableHeader>
              <TableRow>
                <TableHead data-filterable="true">Reference</TableHead>
                <TableHead data-filterable="true">Year</TableHead>
                <TableHead data-filterable="true">Category</TableHead>
                <TableHead data-filterable="true">Risk / Opportunity</TableHead>
                <TableHead data-filterable="true">Priority</TableHead>
                {kind === "RISK" ? (
                  <>
                    <TableHead>Current Score</TableHead>
                    <TableHead>Residual Score</TableHead>
                    <TableHead>Process</TableHead>
                    <TableHead>Treatment</TableHead>
                  </>
                ) : null}
                <TableHead data-filterable="true">Issue / Insight</TableHead>
                <TableHead data-filterable="true">Action Plan</TableHead>
                <TableHead data-filterable="true">Department</TableHead>
                <TableHead data-filterable="true">Responsible Staff</TableHead>
                <TableHead data-filterable="true">Target Date</TableHead>
                <TableHead data-filterable="true">Status</TableHead>
                <TableHead data-filterable="true">Next Review</TableHead>
                <TableHead>Work</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Link
                      className="underline underline-offset-4"
                      href={`${path}/${row.id}`}
                    >
                      {analysisReference(kind, row.number)}
                    </Link>
                  </TableCell>
                  <TableCell>{row.analysisYear}</TableCell>
                  <TableCell>{row.category}</TableCell>
                  <TableCell>{row.focus}</TableCell>
                  <TableCell>
                    <StatusBadge
                      value={row.priority}
                      tone={
                        row.priority === "High"
                          ? "warning"
                          : row.priority === "Not assessed"
                            ? "inactive"
                            : "information"
                      }
                    />
                  </TableCell>
                  {kind === "RISK" ? (
                    <>
                      <TableCell>
                        {riskScore(
                          row.risk?.likelihood ?? null,
                          row.risk?.severity ?? null
                        ) ?? "Needs assessment"}
                      </TableCell>
                      <TableCell>
                        {riskScore(
                          row.riskReview?.likelihood ?? null,
                          row.riskReview?.severity ?? null
                        ) ?? "Not verified"}
                      </TableCell>
                      <TableCell>
                        {row.risk?.process || "Needs assessment"}
                      </TableCell>
                      <TableCell>
                        {row.risk?.treatment || "Not assessed"}
                      </TableCell>
                    </>
                  ) : null}
                  <TableCell className="max-w-96 min-w-56 whitespace-normal">
                    {row.description}
                  </TableCell>
                  <TableCell className="max-w-96 min-w-56 whitespace-normal">
                    {row.actionPlan}
                  </TableCell>
                  <TableCell>{row.department || "Not assigned"}</TableCell>
                  <TableCell>{row.ownerName || "Not assigned"}</TableCell>
                  <TableCell data-filter-value={row.dueOn ?? "Not set"}>
                    {row.dueOn || "Not set"}
                    {overdue(row) ? (
                      <StatusBadge value="Overdue" tone="danger" />
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <StatusBadge
                      value={analysisStatusLabel(row)}
                      tone={
                        row.status === "Closed"
                          ? "inactive"
                          : row.status === "Completed"
                            ? "positive"
                            : "warning"
                      }
                    />
                  </TableCell>
                  <TableCell data-filter-value={row.nextReviewOn ?? "Not set"}>
                    {row.nextReviewOn || "Not set"}
                    {reviewDue(row) ? (
                      <StatusBadge value="Review due" tone="warning" />
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Button asChild size="sm" variant="outline">
                      <Link href={`${path}/${row.id}`}>Open Item</Link>
                    </Button>
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
