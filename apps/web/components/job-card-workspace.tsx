"use client"

import type { ProductionFloorCode } from "@workspace/db/production-floors"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@workspace/ui/components/table"
import { ArrowLeft, Clock3, Factory, RefreshCw, Route } from "lucide-react"
import Link from "next/link"
import { useCallback, useEffect, useState } from "react"

import { dashboardTabHref } from "@/lib/unified-navigation"

type Row = Record<string, unknown>
type Workspace = {
  analytics?: Row
  dashboardSummary?: Row | null
  events?: Row[]
  jobCard?: Row
  planRows?: Row[]
  productionFloorCode?: string
  rawMaterialReceipts?: Row[]
  routes?: Row[]
  sessions?: Row[]
  setups?: Row[]
}

const text = (value: unknown) => String(value ?? "").trim()
const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0
const list = (value: unknown): Row[] => Array.isArray(value)
  ? value.filter((item): item is Row => Boolean(item) && typeof item === "object" && !Array.isArray(item))
  : []
const value = (row: Row | undefined, ...keys: string[]) => keys.map((key) => text(row?.[key])).find(Boolean) ?? ""
const display = (input: unknown) => text(input) || "-"
const title = (input: unknown) => display(input).replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
const quantity = (input: unknown, maximumFractionDigits = 0) => new Intl.NumberFormat("en-IN", { maximumFractionDigits }).format(number(input))
const date = (input: unknown, includeTime = false) => {
  const parsed = new Date(text(input))
  if (Number.isNaN(parsed.getTime())) return "-"
  return new Intl.DateTimeFormat("en-IN", includeTime
    ? { dateStyle: "medium", timeStyle: "short" }
    : { dateStyle: "medium" }).format(parsed)
}

async function loadWorkspace(jobCardNumber: string, floor: ProductionFloorCode) {
  const response = await fetch(`/api/job-cards/${encodeURIComponent(jobCardNumber)}?floor=${encodeURIComponent(floor)}`, {
    cache: "no-store",
    credentials: "same-origin",
  })
  const body = await response.json().catch(() => ({})) as Workspace & { error?: string; message?: string }
  if (!response.ok) throw new Error(body.error || body.message || "Job Card could not be loaded.")
  return body
}

function Metric({ label, value: metric, note }: { label: string; note?: string; value: string }) {
  return <div className="rounded-lg border bg-card p-4">
    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
    <p className="mt-1 text-2xl font-semibold tabular-nums">{metric}</p>
    {note ? <p className="mt-1 text-xs text-muted-foreground">{note}</p> : null}
  </div>
}

function Field({ label, value: fieldValue }: { label: string; value: unknown }) {
  return <div className="grid gap-1 rounded-md border px-3 py-2">
    <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
    <dd className="break-words text-sm font-medium">{display(fieldValue)}</dd>
  </div>
}

function PatternBars({ rows, labelKey }: { labelKey: "name" | "setupNumber"; rows: Row[] }) {
  const maximum = Math.max(...rows.map((row) => number(row.minutes)), 1)
  if (!rows.length) return <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">No downtime recorded.</p>
  return <div className="grid gap-3">{rows.map((row) => {
    const label = display(row[labelKey])
    return <div className="grid gap-1" key={`${label}-${text(row.code)}`}>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="truncate font-medium">{label}</span>
        <span className="shrink-0 tabular-nums">{quantity(row.minutes)} min · {quantity(row.occurrences)} times</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-amber-500" style={{ width: `${Math.max((number(row.minutes) / maximum) * 100, 2)}%` }} /></div>
    </div>
  })}</div>
}

function SetupMaster({ setup }: { setup: Row }) {
  const tools = list(setup.tooling)
  const parameters = list(setup.qualityParameters)
  return <details className="group rounded-lg border" open={number(setup.sequence) === 1}>
    <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-4 py-3">
      <span className="font-semibold">Setup {display(setup.setupNumber)} · {display(setup.operationName || setup.operationCode)}</span>
      <span className="text-xs text-muted-foreground">{display(setup.machineType)} · {quantity(setup.cycleTimeSeconds, 2)} sec</span>
    </summary>
    <div className="grid gap-4 border-t p-4">
      <dl className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        <Field label="Operation Code" value={setup.operationCode} />
        <Field label="Machine Type" value={setup.machineType} />
        <Field label="Cycle Time" value={`${quantity(setup.cycleTimeSeconds, 2)} sec`} />
        <Field label="Pieces / Cycle" value={quantity(setup.piecesPerCycle)} />
        <Field label="Setup Time" value={`${quantity(setup.setupTimeMinutes)} min`} />
      </dl>
      <div className="grid gap-4 xl:grid-cols-2">
        <div>
          <h4 className="mb-2 text-sm font-semibold">Tooling</h4>
          <div className="overflow-x-auto rounded-md border"><Table><TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Description</TableHead><TableHead className="text-right">Qty</TableHead></TableRow></TableHeader><TableBody>
            {tools.length ? tools.map((tool, index) => <TableRow key={`${value(tool, "toolCode")}-${index}`}><TableCell>{display(tool.toolCode)}</TableCell><TableCell>{display(tool.description)}</TableCell><TableCell className="text-right">{quantity(tool.quantity)}</TableCell></TableRow>) : <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">No tooling master selected.</TableCell></TableRow>}
          </TableBody></Table></div>
        </div>
        <div>
          <h4 className="mb-2 text-sm font-semibold">Quality Parameters</h4>
          <div className="overflow-x-auto rounded-md border"><Table><TableHeader><TableRow><TableHead>Parameter</TableHead><TableHead>Limits</TableHead><TableHead>Unit</TableHead></TableRow></TableHeader><TableBody>
            {parameters.length ? parameters.map((parameter, index) => <TableRow key={`${value(parameter, "parameterCode")}-${index}`}><TableCell><span className="font-medium">{display(parameter.name)}</span><span className="block text-xs text-muted-foreground">{display(parameter.parameterCode)}</span></TableCell><TableCell>{display(parameter.lowerLimit)} – {display(parameter.upperLimit)}</TableCell><TableCell>{display(parameter.unit)}</TableCell></TableRow>) : <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">No quality parameters selected.</TableCell></TableRow>}
          </TableBody></Table></div>
        </div>
      </div>
    </div>
  </details>
}

export function JobCardWorkspace({ floor, jobCardNumber }: { floor: ProductionFloorCode; jobCardNumber: string }) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      setWorkspace(await loadWorkspace(jobCardNumber, floor))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Job Card could not be loaded.")
    } finally {
      setLoading(false)
    }
  }, [floor, jobCardNumber])

  useEffect(() => { queueMicrotask(() => void load()) }, [load])

  const analytics = workspace?.analytics ?? {}
  const jobCard = workspace?.jobCard ?? {}
  const sessions = workspace?.sessions ?? []
  const events = workspace?.events ?? []
  const routes = workspace?.routes ?? []
  const setups = workspace?.setups ?? []
  const planRows = workspace?.planRows ?? []
  const receipts = workspace?.rawMaterialReceipts ?? []
  const completion = Math.min(Math.max(number(analytics.completionPercent), 0), 100)
  const selectedRoute = routes.find((row) => row.selected === true)
  const eventCounts = {
    downtime: events.filter((row) => ["downtime", "downtime_started"].includes(text(row.eventType))).length,
    rejection: events.filter((row) => text(row.eventType) === "rejection").length,
  }

  return <main className="grid gap-4 p-4 md:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <Button asChild size="icon" variant="outline"><Link href={dashboardTabHref("jobCardStatusTab", floor)} aria-label="Back to Job Cards"><ArrowLeft /></Link></Button>
        <div><p className="text-sm text-muted-foreground">Job Card Workspace · {title(floor)}</p><h1 className="text-2xl font-semibold">{jobCardNumber}</h1><p className="text-sm text-muted-foreground">{display(jobCard.partCode)} · {display(jobCard.description)}</p></div>
      </div>
      <div className="flex items-center gap-2"><Badge variant={text(jobCard.status).toLowerCase() === "completed" ? "default" : "secondary"}>{title(jobCard.status)}</Badge><Button disabled={loading} variant="outline" onClick={() => void load()}><RefreshCw className={loading ? "animate-spin" : ""} /> Refresh</Button></div>
    </div>

    {error ? <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive" role="alert">{error}</div> : null}
    {loading && !workspace ? <div className="rounded-md border p-10 text-center text-sm text-muted-foreground">Loading Job Card…</div> : null}
    {workspace ? <>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <Metric label="Ordered" value={quantity(analytics.orderedQuantity)} note="pieces" />
        <Metric label="Good Produced" value={quantity(analytics.actualGoodPieces)} note={`${quantity(analytics.completionPercent, 1)}% complete`} />
        <Metric label="Total Produced" value={quantity(analytics.actualProducedPieces)} note="includes rejections" />
        <Metric label="Rejected" value={quantity(analytics.rejectedPieces)} note={`${quantity(analytics.rejectionPercent, 2)}% of production`} />
        <Metric label="Runtime" value={`${quantity(analytics.runtimeMinutes)} min`} note={`${quantity(analytics.sessionCount)} sessions${number(analytics.legacyEntryCount) ? ` · ${quantity(analytics.legacyEntryCount)} earlier entries` : ""}`} />
        <Metric label="Downtime" value={`${quantity(analytics.downtimeMinutes)} min`} note={`${eventCounts.downtime} events`} />
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2"><CardHeader><CardTitle>Plan vs Actual</CardTitle><CardDescription>Completion uses good pieces against ordered pieces.</CardDescription></CardHeader><CardContent className="grid gap-4">
          <div><div className="mb-1 flex justify-between text-sm"><span>Good production</span><strong className="tabular-nums">{quantity(analytics.actualGoodPieces)} / {quantity(analytics.orderedQuantity)} pcs</strong></div><div className="h-3 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-emerald-600" style={{ width: `${completion}%` }} /></div></div>
          <dl className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4"><Field label="Planned Start" value={date(analytics.plannedStartDate)} /><Field label="Actual Start" value={date(analytics.actualStartAt, true)} /><Field label="Planned End" value={date(analytics.plannedEndDate)} /><Field label="Actual End" value={date(analytics.actualEndAt, true)} /></dl>
        </CardContent></Card>
        <Card><CardHeader><CardTitle>Production Signals</CardTitle><CardDescription>Entries recorded against this Job Card.</CardDescription></CardHeader><CardContent className="grid grid-cols-2 gap-3"><Metric label="Downtime Logs" value={quantity(eventCounts.downtime)} /><Metric label="Rejection Logs" value={quantity(eventCounts.rejection)} /></CardContent></Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <Card><CardHeader><CardTitle>Downtime by Reason</CardTitle><CardDescription>Largest loss reasons appear first.</CardDescription></CardHeader><CardContent><PatternBars rows={list(analytics.downtimeByReason)} labelKey="name" /></CardContent></Card>
        <Card><CardHeader><CardTitle>Downtime by Setup</CardTitle><CardDescription>Shows where downtime accumulated.</CardDescription></CardHeader><CardContent><PatternBars rows={list(analytics.downtimeBySetup)} labelKey="setupNumber" /></CardContent></Card>
      </section>

      <Card><CardHeader><CardTitle>Selected Master Data</CardTitle><CardDescription>Product, route, cycle, tooling and quality masters used for this Job Card.</CardDescription></CardHeader><CardContent className="grid gap-5">
        <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4"><Field label="Part Code" value={jobCard.partCode} /><Field label="Description" value={jobCard.description} /><Field label="Work Order" value={jobCard.workOrderNumber} /><Field label="Selected Route" value={selectedRoute ? `${display(selectedRoute.routeCode)} · ${display(selectedRoute.name)}` : "Planner selection required"} /><Field label="Ordered Quantity" value={quantity(jobCard.orderedQuantity)} /><Field label="Order Date" value={date(jobCard.orderDate)} /><Field label="Due Date" value={date(jobCard.dueDate)} /><Field label="Production Type" value={jobCard.productionType} /><Field label="Material Grade" value={jobCard.materialGrade} /><Field label="Rod Type / Size" value={`${display(jobCard.rodType)} / ${display(jobCard.rodSize)}`} /><Field label="Weight / 100 pcs" value={jobCard.weight100Pieces} /><Field label="Pieces / Kg" value={jobCard.piecesPerKg} /></dl>
        <div><h3 className="mb-2 flex items-center gap-2 font-semibold"><Route className="size-4" /> Route Options</h3><div className="flex flex-wrap gap-2">{routes.length ? routes.map((routeRow) => <Badge key={text(routeRow.id)} variant={routeRow.selected ? "default" : "outline"}>{display(routeRow.routeCode)} · {display(routeRow.name)}{routeRow.selected ? " · Selected" : ""}</Badge>) : <span className="text-sm text-muted-foreground">No route master for this production unit.</span>}</div></div>
        <div className="grid gap-2"><h3 className="flex items-center gap-2 font-semibold"><Factory className="size-4" /> Setup Masters</h3>{setups.length ? setups.map((setup) => <SetupMaster key={text(setup.id)} setup={setup} />) : <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">Select a route in Planner Actions to load its setup masters.</p>}</div>
      </CardContent></Card>

      <Card><CardHeader><CardTitle>Production Plan</CardTitle><CardDescription>Planner rows for this Job Card and production unit.</CardDescription></CardHeader><CardContent><div className="overflow-x-auto rounded-md border"><Table excelFilters><TableHeader><TableRow><TableHead>Machine</TableHead><TableHead>Setup</TableHead><TableHead>Planned Start</TableHead><TableHead>Planned End</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>{planRows.length ? planRows.map((row, index) => <TableRow key={`${value(row, "machineNo", "machineNumber")}-${value(row, "setupNo", "setupNumber")}-${index}`}><TableCell>{value(row, "machineNo", "machineNumber") || "-"}</TableCell><TableCell>{value(row, "setupNo", "setupNumber") || "-"}</TableCell><TableCell>{date(value(row, "plannedProductionStartDate", "productionStartDate"))}</TableCell><TableCell>{date(value(row, "plannedProductionEndDate", "productionEndDate"))}</TableCell><TableCell>{title(value(row, "runningStatus", "status", "shopFloorStage"))}</TableCell></TableRow>) : <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No production plan rows available.</TableCell></TableRow>}</TableBody></Table></div></CardContent></Card>

      <Card><CardHeader><CardTitle>Production Sessions</CardTitle><CardDescription>Every machine/operator session recorded for this Job Card.</CardDescription></CardHeader><CardContent><div className="overflow-x-auto rounded-md border"><Table excelFilters><TableHeader><TableRow><TableHead>Session</TableHead><TableHead>Machine</TableHead><TableHead>Setup</TableHead><TableHead>Operator</TableHead><TableHead>Started</TableHead><TableHead>Ended</TableHead><TableHead className="text-right">Produced</TableHead><TableHead className="text-right">Rejected</TableHead><TableHead className="text-right">Good</TableHead><TableHead className="text-right">Downtime</TableHead></TableRow></TableHeader><TableBody>{sessions.length ? sessions.map((row) => <TableRow key={text(row.id)}><TableCell><span className="font-medium">{display(row.session_reference)}</span><Badge className="ml-2" variant={text(row.status) === "open" ? "default" : "outline"}>{title(row.status)}</Badge></TableCell><TableCell>{display(row.machine_number)}</TableCell><TableCell>{display(row.setup_number)}</TableCell><TableCell>{display(row.operator_code)}<span className="block text-xs text-muted-foreground">{display(row.operator_name)}</span></TableCell><TableCell>{date(row.started_at, true)}</TableCell><TableCell>{date(row.ended_at, true)}</TableCell><TableCell className="text-right tabular-nums">{quantity(row.total_pieces)}</TableCell><TableCell className="text-right tabular-nums">{quantity(row.quantity_rejected)}</TableCell><TableCell className="text-right tabular-nums">{quantity(row.quantity_good)}</TableCell><TableCell className="text-right tabular-nums">{quantity(row.downtime_minutes)} min</TableCell></TableRow>) : <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground">No production sessions recorded.</TableCell></TableRow>}</TableBody></Table></div></CardContent></Card>

      <Card><CardHeader><CardTitle className="flex items-center gap-2"><Clock3 className="size-4" /> Complete Job Card Log</CardTitle><CardDescription>Production, downtime, rejection and workflow events in one timeline.</CardDescription></CardHeader><CardContent><div className="max-h-[32rem] overflow-auto rounded-md border"><Table excelFilters><TableHeader className="sticky top-0 z-10 bg-background"><TableRow><TableHead>Time</TableHead><TableHead>Event</TableHead><TableHead>Setup / Machine</TableHead><TableHead>Entered By</TableHead><TableHead>Detail</TableHead><TableHead className="text-right">Value</TableHead></TableRow></TableHeader><TableBody>{events.length ? events.map((row, index) => <TableRow key={`${text(row.eventTime)}-${text(row.eventType)}-${index}`}><TableCell className="whitespace-nowrap">{date(row.eventTime, true)}</TableCell><TableCell><Badge variant={text(row.eventType) === "rejection" ? "destructive" : "outline"}>{title(row.eventType)}</Badge></TableCell><TableCell>{display(row.setupNumber)} / {display(row.machineNumber)}</TableCell><TableCell>{display(row.enteredByName)}<span className="block text-xs text-muted-foreground">{title(row.enteredRole)}</span></TableCell><TableCell>{display(row.reasonName || row.detail)}</TableCell><TableCell className="text-right tabular-nums">{row.quantity ? `${quantity(row.quantity)} pcs` : row.durationMinutes ? `${quantity(row.durationMinutes)} min` : "-"}</TableCell></TableRow>) : <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No Job Card events recorded.</TableCell></TableRow>}</TableBody></Table></div></CardContent></Card>

      <Card><CardHeader><CardTitle>Raw Material Receipts</CardTitle><CardDescription>Material inward records linked to this Job Card.</CardDescription></CardHeader><CardContent><div className="overflow-x-auto rounded-md border"><Table><TableHeader><TableRow><TableHead>Receipt</TableHead><TableHead>Date</TableHead><TableHead>Heat No.</TableHead><TableHead>Supplier</TableHead><TableHead className="text-right">Received Kg</TableHead><TableHead className="text-right">Remaining Kg</TableHead></TableRow></TableHeader><TableBody>{receipts.length ? receipts.map((row, index) => <TableRow key={`${text(row.receiptNumber)}-${index}`}><TableCell>{display(row.receiptNumber)}</TableCell><TableCell>{date(row.receivedOn)}</TableCell><TableCell>{display(row.heatNumber)}</TableCell><TableCell>{display(row.supplierName)}</TableCell><TableCell className="text-right tabular-nums">{quantity(row.quantityKg, 3)}</TableCell><TableCell className="text-right tabular-nums">{quantity(row.remainingQuantityKg, 3)}</TableCell></TableRow>) : <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No linked raw material receipts.</TableCell></TableRow>}</TableBody></Table></div></CardContent></Card>
    </> : null}
  </main>
}
