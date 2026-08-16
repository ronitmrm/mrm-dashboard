"use client"

import type { ProductionFloorCode } from "@workspace/db/production-floors"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@workspace/ui/components/table"
import { ExternalLink, Search } from "lucide-react"
import Link from "next/link"
import { useMemo, useState } from "react"

import { jobCardWorkspaceHref } from "@/lib/unified-navigation"

type Row = Record<string, unknown>
const text = (value: unknown) => String(value ?? "").trim()
const first = (row: Row, keys: string[]) => keys.map((key) => text(row[key])).find(Boolean) ?? "-"
const numeric = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0

function jobCardProgress(row: Row) {
  const ordered = numeric(row.orderPcs ?? row.orderedQty ?? row["ORD. PCS."])
  const good = numeric(row.rawActualQty ?? row.actualGoodPieces ?? row.completedQuantity)
  return ordered > 0 ? Math.min(Math.max((good / ordered) * 100, 0), 100) : 0
}

function jobCardStage(row: Row) {
  const progress = jobCardProgress(row)
  const dispatch = first(row, ["dispatchStatus", "status"])
  if (dispatch.toLowerCase().includes("dispatch")) return "Dispatch"
  if (progress >= 100) return "Production complete"
  if (progress > 0) return "Production"
  if (first(row, ["rmStatus"]).toLowerCase() !== "received") return "Awaiting RM"
  if (["routeStatus", "cycleStatus", "toolingStatus", "machineMasterStatus"].some((key) => text(row[key]).toLowerCase().includes("missing"))) return "Master readiness"
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
  const [query, setQuery] = useState("")
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return rows.filter((row) => !needle || [
      first(row, ["jcNo", "JobCardNo", "jobCard"]),
      first(row, ["partCode", "itemCode", "PART CODE"]),
      first(row, ["fgPoNo", "FG PO NO."]),
      first(row, ["description", "DESCRIPTION"]),
      first(row, ["routeStatus", "optionNumber", "selectedOption"]),
    ].some((value) => value.toLowerCase().includes(needle)))
  }, [query, rows])

  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Job Card Register</CardTitle>
            <CardDescription>One row per Job Card. Open a Job Card for masters, history and analytics.</CardDescription>
          </div>
          {actionNeededCount ? <Button variant="outline" onClick={onOpenMasterReadiness}>{actionNeededCount} need master action</Button> : null}
        </div>
        <div className="relative max-w-xl">
          <Search className="absolute left-3 top-3 size-4 text-muted-foreground" />
          <Input className="h-10 pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Job Card, part, PO or route" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="max-h-[70vh] overflow-auto rounded-md border">
          <Table excelFilters>
            <TableHeader className="sticky top-0 z-10 bg-background"><TableRow>
              <TableHead>Job Card</TableHead><TableHead>Part</TableHead><TableHead>Description</TableHead><TableHead>FG PO</TableHead><TableHead className="text-right">Order Qty</TableHead><TableHead>Stage</TableHead><TableHead>Production Progress</TableHead><TableHead>Route</TableHead><TableHead />
            </TableRow></TableHeader>
            <TableBody>{visible.length ? visible.map((row) => {
              const jobCard = first(row, ["jcNo", "JobCardNo", "jobCard"])
              const href = jobCardWorkspaceHref(jobCard, floor)
              const progress = jobCardProgress(row)
              return <TableRow key={jobCard}>
                <TableCell><Link className="font-semibold text-primary hover:underline" href={href}>{jobCard}</Link></TableCell>
                <TableCell>{first(row, ["partCode", "itemCode", "PART CODE"])}</TableCell>
                <TableCell className="max-w-72 truncate">{first(row, ["description", "DESCRIPTION"])}</TableCell>
                <TableCell>{first(row, ["fgPoNo", "FG PO NO."])}</TableCell>
                <TableCell className="text-right tabular-nums">{first(row, ["orderPcs", "orderedQty", "ORD. PCS."])}</TableCell>
                <TableCell>{jobCardStage(row)}</TableCell>
                <TableCell className="min-w-40"><div className="mb-1 flex justify-between gap-2 text-xs"><span>{progress.toFixed(1)}%</span><span>{new Intl.NumberFormat("en-IN").format(numeric(row.rawActualQty))} good</span></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-emerald-600" style={{ width: `${progress}%` }} /></div></TableCell>
                <TableCell>{first(row, ["optionNumber", "selectedOption", "routeStatus"])}</TableCell>
                <TableCell><Button asChild size="sm" variant="outline"><Link href={href}>Open <ExternalLink /></Link></Button></TableCell>
              </TableRow>
            }) : <TableRow><TableCell colSpan={9} className="py-10 text-center text-muted-foreground">No Job Cards match this search.</TableCell></TableRow>}</TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
