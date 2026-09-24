"use client"

import type { ProductionFloorCode } from "@workspace/db/production-floors"
import { Button } from "@workspace/ui/components/button"
import { SectionCard, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { OperationalTable, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@workspace/ui/components/table"
import { ExternalLink } from "lucide-react"
import Link from "next/link"

import { jobCardWorkspaceHref } from "@/lib/unified-navigation"
import { MetricSummary } from "@/components/ui/golden-patterns"

type Row = Record<string, unknown>
const text = (value: unknown) => String(value ?? "").trim()
const first = (row: Row, keys: string[]) => keys.map((key) => text(row[key])).find(Boolean) ?? "-"
const numeric = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0
const jobCardKey = (row: Row) => [
  first(row, ["jcNo", "JobCardNo", "jobCard"]),
  first(row, ["partCode", "itemCode", "PART CODE"]),
].map((value) => value.toUpperCase()).join("|")

function jobCardProgress(row: Row) {
  return row.productionProgressPercent == null
    ? null
    : Math.min(Math.max(numeric(row.productionProgressPercent), 0), 100)
}

function jobCardStage(row: Row) {
  const progress = jobCardProgress(row)
  const dispatch = first(row, ["dispatchStatus", "status"])
  if (dispatch.toLowerCase().includes("dispatch")) return "Dispatch"
  if (progress !== null && progress >= 100) return "Production complete"
  if ((progress ?? 0) > 0 || numeric(row.rawRows) > 0 || numeric(row.rawActualQty) > 0 || numeric(row.rawOutputQty) > 0) return "Production"
  if (first(row, ["rmStatus"]).toLowerCase() !== "received") return "Awaiting RM"
  if (["routeStatus", "cycleStatus", "toolingStatus", "machineMasterStatus"].some((key) => text(row[key]).toLowerCase().includes("missing"))) return "Part readiness"
  return "Ready for setup"
}

export function JobCardRegister({
  actionNeededCount,
  finishDateRows,
  floor,
  onOpenMasterReadiness,
  rows,
}: {
  actionNeededCount: number
  finishDateRows: Row[]
  floor: ProductionFloorCode
  onOpenMasterReadiness: () => void
  rows: Row[]
}) {
  const finishDatesByJobCard = new Map(finishDateRows.map((row) => [jobCardKey(row), row]))
  return (
 <SectionCard>
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Job Card Register</CardTitle>
          </div>
          {actionNeededCount ? <Button variant="outline" onClick={onOpenMasterReadiness}>{actionNeededCount} need master action</Button> : null}
        </div>
      </CardHeader>
      <CardContent>
        <MetricSummary
          className="mb-4"
          scope="Selected production unit · before table filters"
          items={[
            { label: "Job Cards", value: rows.length, tone: "information" },
            {
              label: "Awaiting RM",
              value: rows.filter((row) => jobCardStage(row) === "Awaiting RM")
                .length,
              tone: "warning"
            },
            {
              label: "Production Complete",
              value: rows.filter(
                (row) => jobCardStage(row) === "Production complete"
              ).length,
              description: "Completed, not yet in dispatch stage",
              tone: "positive"
            }
          ]}
        />
        <div className="rounded-md border min-w-0">
 <OperationalTable containerClassName="max-h-[70vh]" excelFilters>
            <TableHeader className="sticky top-0 z-10 bg-background"><TableRow>
              <TableHead data-filterable="true">Job Card</TableHead><TableHead>Part</TableHead><TableHead>Description</TableHead><TableHead>FG PO</TableHead><TableHead className="text-right">Order Qty</TableHead><TableHead>Stage</TableHead><TableHead title="Immutable first valid forecast linked to the first RM receipt; legacy unavailable values are not guessed">Planned Finish Date</TableHead><TableHead title="Latest completion forecast across all route setups; updates after planning recalculates">Current Estimated Finish</TableHead><TableHead>Production Progress</TableHead><TableHead>Route</TableHead><TableHead />
            </TableRow></TableHeader>
            <TableBody>{rows.length ? rows.map((row) => {
              const jobCard = first(row, ["jcNo", "JobCardNo", "jobCard"])
              const href = jobCardWorkspaceHref(jobCard, floor)
              const progress = jobCardProgress(row)
              const setupCount = numeric(row.productionSetupCount)
              const completedSetups = numeric(row.completedProductionSetupCount)
              const finishDates = finishDatesByJobCard.get(jobCardKey(row))
              const plannedFinish = text(finishDates?.plannedDispatchDateAtRmReceipt)
              return <TableRow key={jobCard}>
                <TableCell><Link className="font-semibold text-primary hover:underline" href={href}>{jobCard}</Link></TableCell>
                <TableCell>{first(row, ["partCode", "itemCode", "PART CODE"])}</TableCell>
                <TableCell className="max-w-72 truncate">{first(row, ["description", "DESCRIPTION"])}</TableCell>
                <TableCell>{first(row, ["fgPoNo", "FG PO NO."])}</TableCell>
                <TableCell className="text-right tabular-nums">{first(row, ["orderPcs", "orderedQty", "ORD. PCS."])}</TableCell>
                <TableCell>{jobCardStage(row)}</TableCell>
                <TableCell>{plannedFinish || <span className="text-muted-foreground">Not recorded</span>}</TableCell>
                <TableCell>{text(finishDates?.currentProbableDispatchDate) || "-"}</TableCell>
                <TableCell className="min-w-48">
                  {progress === null ? <span className="text-xs text-muted-foreground">Progress unavailable</span> : (
                    <div className="space-y-1.5 py-1" title="Each route setup contributes an equal share of overall progress">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-sm font-semibold tabular-nums">{progress.toFixed(1)}%</span>
                        <span className="text-xs text-muted-foreground">overall</span>
                      </div>
                      <div role="progressbar" aria-label={`${jobCard} overall production progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-valuetext={`${progress.toFixed(1)}% overall; ${completedSetups} of ${setupCount} setups complete`} className="h-2 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-[var(--color-information)] data-[complete=true]:bg-[var(--color-positive)]" data-complete={progress >= 100} style={{ width: `${progress}%` }} />
                      </div>
                      <div className="text-xs text-muted-foreground tabular-nums">{completedSetups}/{setupCount} setups complete</div>
                    </div>
                  )}
                </TableCell>
                <TableCell>{first(row, ["optionNumber", "selectedOption", "routeStatus"])}</TableCell>
                <TableCell><Button asChild size="sm" variant="outline"><Link href={href}>Open <ExternalLink /></Link></Button></TableCell>
              </TableRow>
            }) : <TableRow><TableCell colSpan={11} className="py-10 text-center text-muted-foreground">No Job Cards match this search.</TableCell></TableRow>}</TableBody>
 </OperationalTable>
        </div>
      </CardContent>
 </SectionCard>
  )
}
