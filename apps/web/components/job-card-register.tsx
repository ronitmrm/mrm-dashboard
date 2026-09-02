"use client"

import type { ProductionFloorCode } from "@workspace/db/production-floors"
import { Button } from "@workspace/ui/components/button"
import { SectionCard, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { OperationalTable, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@workspace/ui/components/table"
import { ExternalLink } from "lucide-react"
import Link from "next/link"

import { jobCardWorkspaceHref } from "@/lib/unified-navigation"

type Row = Record<string, unknown>
const text = (value: unknown) => String(value ?? "").trim()
const first = (row: Row, keys: string[]) => keys.map((key) => text(row[key])).find(Boolean) ?? "-"
const numeric = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0

function jobCardProgress(row: Row) {
  const ordered = numeric(row.orderPcs ?? row.orderedQty ?? row["ORD. PCS."])
  const good = numeric(row.finalSetupGoodPieces)
  return ordered > 0 ? Math.min(Math.max((good / ordered) * 100, 0), 100) : 0
}

function jobCardStage(row: Row) {
  const progress = jobCardProgress(row)
  const dispatch = first(row, ["dispatchStatus", "status"])
  if (dispatch.toLowerCase().includes("dispatch")) return "Dispatch"
  if (progress >= 100) return "Production complete"
  if (progress > 0 || numeric(row.rawRows) > 0 || numeric(row.rawActualQty) > 0 || numeric(row.rawOutputQty) > 0) return "Production"
  if (first(row, ["rmStatus"]).toLowerCase() !== "received") return "Awaiting RM"
  if (["routeStatus", "cycleStatus", "toolingStatus", "machineMasterStatus"].some((key) => text(row[key]).toLowerCase().includes("missing"))) return "Part readiness"
  return "Ready for setup"
}

export function JobCardRegister({
  actionNeededCount,
  floor,
  onOpenMasterReadiness,
  rows,
}: {
  actionNeededCount: number
  floor: ProductionFloorCode
  onOpenMasterReadiness: () => void
  rows: Row[]
}) {
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
        <div className="max-h-[70vh] overflow-auto rounded-md border">
 <OperationalTable containerClassName="max-h-none overflow-visible" excelFilters>
            <TableHeader className="sticky top-0 z-10 bg-background"><TableRow>
              <TableHead data-filterable="true">Job Card</TableHead><TableHead>Part</TableHead><TableHead>Description</TableHead><TableHead>FG PO</TableHead><TableHead className="text-right">Order Qty</TableHead><TableHead>Stage</TableHead><TableHead>Production Progress</TableHead><TableHead>Route</TableHead><TableHead />
            </TableRow></TableHeader>
            <TableBody>{rows.length ? rows.map((row) => {
              const jobCard = first(row, ["jcNo", "JobCardNo", "jobCard"])
              const href = jobCardWorkspaceHref(jobCard, floor)
              const progress = jobCardProgress(row)
              const finishedPieces = numeric(row.finalSetupGoodPieces)
              return <TableRow key={jobCard}>
                <TableCell><Link className="font-semibold text-primary hover:underline" href={href}>{jobCard}</Link></TableCell>
                <TableCell>{first(row, ["partCode", "itemCode", "PART CODE"])}</TableCell>
                <TableCell className="max-w-72 truncate">{first(row, ["description", "DESCRIPTION"])}</TableCell>
                <TableCell>{first(row, ["fgPoNo", "FG PO NO."])}</TableCell>
                <TableCell className="text-right tabular-nums">{first(row, ["orderPcs", "orderedQty", "ORD. PCS."])}</TableCell>
                <TableCell>{jobCardStage(row)}</TableCell>
 <TableCell className="min-w-40"><div className="mb-1 flex justify-between gap-2 text-xs"><span>{progress.toFixed(1)}%</span><span>{new Intl.NumberFormat("en-IN").format(finishedPieces)} finished</span></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-[var(--color-positive-bg)]" style={{ width: `${progress}%` }} /></div></TableCell>
                <TableCell>{first(row, ["optionNumber", "selectedOption", "routeStatus"])}</TableCell>
                <TableCell><Button asChild size="sm" variant="outline"><Link href={href}>Open <ExternalLink /></Link></Button></TableCell>
              </TableRow>
            }) : <TableRow><TableCell colSpan={9} className="py-10 text-center text-muted-foreground">No Job Cards match this search.</TableCell></TableRow>}</TableBody>
 </OperationalTable>
        </div>
      </CardContent>
 </SectionCard>
  )
}
