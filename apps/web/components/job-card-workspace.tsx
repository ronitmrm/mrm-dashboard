"use client"

import type { ProductionFloorCode } from "@workspace/db/production-floors"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { NativeSelect, NativeSelectOption } from "@workspace/ui/components/native-select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@workspace/ui/components/table"
import { ArrowLeft, Factory, History, RefreshCw, Route, Save, Settings2, ShieldAlert, Truck } from "lucide-react"
import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"

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
  setupTimings?: Row[]
}
type TabKey = "overview" | "masters" | "setup" | "production" | "rejection" | "downtime" | "delivery" | "log"

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "masters", label: "Masters" },
  { key: "setup", label: "Setup" },
  { key: "production", label: "Production" },
  { key: "rejection", label: "Rejection" },
  { key: "downtime", label: "Downtime" },
  { key: "delivery", label: "Delivery" },
  { key: "log", label: "Complete Log" },
]
const emptyRows: Row[] = []

const text = (value: unknown) => String(value ?? "").trim()
const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0
const record = (value: unknown): Row => value && typeof value === "object" && !Array.isArray(value) ? value as Row : {}
const list = (value: unknown): Row[] => Array.isArray(value)
  ? value.filter((item): item is Row => Boolean(item) && typeof item === "object" && !Array.isArray(item))
  : []
const value = (row: Row | undefined, ...keys: string[]) => keys.map((key) => text(row?.[key])).find(Boolean) ?? ""
const display = (input: unknown) => text(input) || "-"
const title = (input: unknown) => display(input).replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
const quantity = (input: unknown, maximumFractionDigits = 0) => new Intl.NumberFormat("en-IN", { maximumFractionDigits }).format(number(input))
const piecesEstimate = (input: unknown) => input === null || input === undefined
  ? "Master value required"
  : `${quantity(input)} pcs`
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

function PatternBars({ emptyText, rows, valueKey = "minutes" }: { emptyText: string; rows: Row[]; valueKey?: "minutes" | "quantity" }) {
  const maximum = Math.max(...rows.map((row) => number(row[valueKey])), 1)
  if (!rows.length) return <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">{emptyText}</p>
  return <div className="grid gap-3">{rows.map((row, index) => {
    const label = display(row.name || row.reasonName || row.setupNumber)
    const amount = number(row[valueKey])
    return <div className="grid gap-1" key={`${label}-${index}`}>
      <div className="flex items-center justify-between gap-3 text-sm"><span className="truncate font-medium">{label}</span><span className="shrink-0 tabular-nums">{quantity(amount)} {valueKey === "minutes" ? "min" : "pcs"}</span></div>
      <div className="h-2 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${valueKey === "minutes" ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${Math.max((amount / maximum) * 100, 2)}%` }} /></div>
    </div>
  })}</div>
}

function EventTable({ emptyText, rows }: { emptyText: string; rows: Row[] }) {
  return <div className="max-h-[32rem] overflow-auto rounded-md border"><Table excelFilters><TableHeader className="sticky top-0 z-10 bg-background"><TableRow><TableHead>Time</TableHead><TableHead>Event</TableHead><TableHead>Setup / Machine</TableHead><TableHead>Entered By</TableHead><TableHead>Detail</TableHead><TableHead className="text-right">Value</TableHead></TableRow></TableHeader><TableBody>{rows.length ? rows.map((row, index) => <TableRow key={`${text(row.eventTime)}-${text(row.eventType)}-${index}`}><TableCell className="whitespace-nowrap">{date(row.eventTime, true)}</TableCell><TableCell><Badge variant={text(row.eventType) === "rejection" ? "destructive" : "outline"}>{title(row.eventType)}</Badge></TableCell><TableCell>{display(row.setupNumber)} / {display(row.machineNumber)}</TableCell><TableCell>{display(row.enteredByName)}<span className="block text-xs text-muted-foreground">{title(row.enteredRole)}</span></TableCell><TableCell>{display(row.reasonName || row.detail)}</TableCell><TableCell className="text-right tabular-nums">{row.quantity ? `${quantity(row.quantity)} pcs` : row.durationMinutes ? `${quantity(row.durationMinutes)} min` : "-"}</TableCell></TableRow>) : <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">{emptyText}</TableCell></TableRow>}</TableBody></Table></div>
}

function SetupMaster({ setup }: { setup: Row }) {
  const tools = list(setup.tooling)
  const parameters = list(setup.qualityParameters)
  return <details className="group rounded-lg border">
    <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-4 py-3"><span className="font-semibold">Setup {display(setup.setupNumber)} · {display(setup.operationName || setup.operationCode)}</span><span className="text-xs text-muted-foreground">{display(setup.machineType)} · {quantity(setup.cycleTimeSeconds, 2)} sec</span></summary>
    <div className="grid gap-4 border-t p-4">
      <dl className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5"><Field label="Operation Code" value={setup.operationCode} /><Field label="Machine Type" value={setup.machineType} /><Field label="Cycle Time" value={`${quantity(setup.cycleTimeSeconds, 2)} sec`} /><Field label="Pieces / Cycle" value={quantity(setup.piecesPerCycle)} /><Field label="Setup Target" value={`${quantity(setup.setupTimeMinutes)} min`} /></dl>
      <div className="grid gap-4 xl:grid-cols-2">
        <div><h4 className="mb-2 text-sm font-semibold">Tooling</h4><div className="overflow-x-auto rounded-md border"><Table><TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Description</TableHead><TableHead className="text-right">Qty</TableHead></TableRow></TableHeader><TableBody>{tools.length ? tools.map((tool, index) => <TableRow key={`${value(tool, "toolCode")}-${index}`}><TableCell>{display(tool.toolCode)}</TableCell><TableCell>{display(tool.description)}</TableCell><TableCell className="text-right">{quantity(tool.quantity)}</TableCell></TableRow>) : <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">No tooling master selected.</TableCell></TableRow>}</TableBody></Table></div></div>
        <div><h4 className="mb-2 text-sm font-semibold">Quality Parameters</h4><div className="overflow-x-auto rounded-md border"><Table><TableHeader><TableRow><TableHead>Parameter</TableHead><TableHead>Limits</TableHead><TableHead>Unit</TableHead></TableRow></TableHeader><TableBody>{parameters.length ? parameters.map((parameter, index) => <TableRow key={`${value(parameter, "parameterCode")}-${index}`}><TableCell><span className="font-medium">{display(parameter.name)}</span><span className="block text-xs text-muted-foreground">{display(parameter.parameterCode)}</span></TableCell><TableCell>{display(parameter.lowerLimit)} – {display(parameter.upperLimit)}</TableCell><TableCell>{display(parameter.unit)}</TableCell></TableRow>) : <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">No quality parameters selected.</TableCell></TableRow>}</TableBody></Table></div></div>
      </div>
    </div>
  </details>
}

export function JobCardWorkspace({ floor, jobCardNumber }: { floor: ProductionFloorCode; jobCardNumber: string }) {
  const [activeTab, setActiveTab] = useState<TabKey>("overview")
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)
  const [productDays, setProductDays] = useState("")
  const [overrideDays, setOverrideDays] = useState("")
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const next = await loadWorkspace(jobCardNumber, floor)
      setWorkspace(next)
      const target = record(record(next.analytics).deliveryTarget)
      setProductDays(text(target.productDefaultWorkingDays))
      setOverrideDays(text(target.jobCardOverrideWorkingDays))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Job Card could not be loaded.")
    } finally {
      setLoading(false)
    }
  }, [floor, jobCardNumber])

  useEffect(() => { queueMicrotask(() => void load()) }, [load])

  const analytics = workspace?.analytics ?? {}
  const jobCard = workspace?.jobCard ?? {}
  const sessions = workspace?.sessions ?? emptyRows
  const events = workspace?.events ?? emptyRows
  const routes = workspace?.routes ?? emptyRows
  const setups = workspace?.setups ?? emptyRows
  const setupTimings = workspace?.setupTimings ?? list(analytics.setupTimings)
  const planRows = workspace?.planRows ?? emptyRows
  const receipts = workspace?.rawMaterialReceipts ?? emptyRows
  const delivery = record(analytics.delivery)
  const deliveryTarget = record(analytics.deliveryTarget)
  const material = record(analytics.material)
  const completion = Math.min(Math.max(number(analytics.completionPercent), 0), 100)
  const finalSetupNumber = text(analytics.finalSetupNumber)
  const hasFinishedOutput = number(analytics.actualProducedPieces) > 0
  const finishedOutputNote = hasFinishedOutput
    ? `${quantity(analytics.actualGoodPieces)} finished pcs${finalSetupNumber ? ` from Setup ${finalSetupNumber}` : ""}`
    : `Waiting for output from final Setup ${finalSetupNumber || "-"}`
  const selectedRoute = routes.find((row) => row.selected === true)
  const downtimeEvents = events.filter((row) => text(row.eventType).startsWith("downtime"))
  const rejectionEvents = events.filter((row) => text(row.eventType) === "rejection")
  const rejectionPatterns = useMemo(() => {
    const groups = new Map<string, Row>()
    for (const event of events) {
      if (text(event.eventType) !== "rejection") continue
      const name = value(event, "reasonName", "detail") || "Uncoded"
      const group = groups.get(name) ?? { name, quantity: 0 }
      group.quantity = number(group.quantity) + number(event.quantity)
      groups.set(name, group)
    }
    return [...groups.values()].sort((left, right) => number(right.quantity) - number(left.quantity))
  }, [events])
  const currentStage = number(analytics.actualGoodPieces) >= number(analytics.orderedQuantity) && number(analytics.orderedQuantity) > 0
    ? "Production complete"
    : sessions.some((row) => text(row.status) === "open")
      ? "Production running"
      : number(analytics.actualGoodPieces) > 0
        ? "Production"
        : setupTimings.some((row) => row.qualityApprovedAt)
          ? "Ready for production"
          : setupTimings.some((row) => row.settingCompletedAt)
            ? "Awaiting quality approval"
            : setupTimings.some((row) => row.settingStartedAt)
              ? "Setup in progress"
              : !selectedRoute
                ? "Master readiness"
                : receipts.length === 0
                  ? "Awaiting raw material"
                  : "Ready for setup"

  async function saveDeliveryTarget() {
    setSaving(true)
    setSaveMessage("")
    try {
      const response = await fetch("/api/job-card-delivery-target", {
        body: JSON.stringify({
          jcNo: jobCardNumber,
          jobCardOverrideWorkingDays: overrideDays || null,
          productDefaultWorkingDays: productDays || null,
          productionFloorCode: floor,
        }),
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        method: "POST",
      })
      const body = await response.json().catch(() => ({})) as { error?: string; message?: string }
      if (!response.ok) throw new Error(body.error || "Delivery target could not be saved.")
      setSaveMessage(body.message || "Delivery target saved.")
      await load()
    } catch (reason) {
      setSaveMessage(reason instanceof Error ? reason.message : "Delivery target could not be saved.")
    } finally {
      setSaving(false)
    }
  }

  return <main className="grid gap-4 p-4 md:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3"><Button asChild size="icon" variant="outline"><Link href={dashboardTabHref("jobCardStatusTab", floor)} aria-label="Back to Job Cards"><ArrowLeft /></Link></Button><div><p className="text-sm text-muted-foreground">Job Card · {title(floor)}</p><h1 className="text-2xl font-semibold">{jobCardNumber}</h1><p className="text-sm text-muted-foreground">{display(jobCard.partCode)} · {display(jobCard.description)}</p></div></div>
      <div className="flex items-center gap-2"><Badge variant={completion >= 100 ? "default" : "secondary"}>{currentStage}</Badge><Button disabled={loading} variant="outline" onClick={() => void load()}><RefreshCw className={loading ? "animate-spin" : ""} /> Refresh</Button></div>
    </div>

    {error ? <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive" role="alert">{error}</div> : null}
    {loading && !workspace ? <div className="rounded-md border p-10 text-center text-sm text-muted-foreground">Loading Job Card…</div> : null}
    {workspace ? <>
      <Label className="grid max-w-sm gap-1 text-sm font-medium">
        <span>Job Card Actions</span>
        <NativeSelect className="w-full" value={activeTab} onChange={(event) => setActiveTab(event.target.value as TabKey)}>
          {tabs.map((tab) => <NativeSelectOption key={tab.key} value={tab.key}>{tab.label}</NativeSelectOption>)}
        </NativeSelect>
      </Label>

      {activeTab === "overview" ? <section className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Job Complete" value={`${quantity(completion, 1)}%`} note={finishedOutputNote} /><Metric label="Current Stage" value={currentStage} /><Metric label="Delivery Rating" value={display(delivery.rating)} note={display(delivery.status)} /><Metric label="Order Short" value={quantity(material.orderShortPieces)} note="finished pieces still required" /></div>
        <Card><CardHeader><CardTitle>Job Card Progress</CardTitle><CardDescription>Only good output from the final setup counts as finished Job Card production.</CardDescription></CardHeader><CardContent className="grid gap-4"><div><div className="mb-1 flex justify-between gap-3 text-sm"><span>Finished production</span><strong className="text-right tabular-nums">{hasFinishedOutput ? `${quantity(analytics.actualGoodPieces)} / ${quantity(analytics.orderedQuantity)} pcs` : "No finished pieces yet"}</strong></div><div className="h-4 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-emerald-600" style={{ width: `${completion}%` }} /></div><p className="mt-1 text-xs text-muted-foreground">Earlier setup output remains work in progress until it passes Setup {finalSetupNumber || "-"}.</p></div><dl className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4"><Field label="Planned Start" value={date(analytics.plannedStartDate)} /><Field label="Actual Start" value={date(analytics.actualStartAt, true)} /><Field label="Planned End" value={date(analytics.plannedEndDate)} /><Field label="Target Delivery" value={date(delivery.targetDate)} /></dl></CardContent></Card>
        <Card><CardHeader><CardTitle>Exceptions Needing Attention</CardTitle><CardDescription>The shortest route to what needs investigation.</CardDescription></CardHeader><CardContent className="grid gap-2 md:grid-cols-3"><Field label="Rejected Pieces" value={quantity(analytics.rejectedPieces)} /><Field label="Downtime" value={`${quantity(analytics.downtimeMinutes)} min`} /><Field label="Unexplained Material Loss" value={material.available === false ? "Set Product Master pieces/kg" : `${quantity(material.unexplainedLossPieces)} pcs estimate`} /></CardContent></Card>
      </section> : null}

      {activeTab === "masters" ? <Card><CardHeader><CardTitle>Selected Master Data</CardTitle><CardDescription>Only the product, route, cycle, tooling and quality masters used by this Job Card.</CardDescription></CardHeader><CardContent className="grid gap-5">
        <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4"><Field label="Part Code" value={jobCard.partCode} /><Field label="Description" value={jobCard.description} /><Field label="Work Order" value={jobCard.workOrderNumber} /><Field label="Selected Route" value={selectedRoute ? `${display(selectedRoute.routeCode)} · ${display(selectedRoute.name)}` : "Planner selection required"} /><Field label="Ordered Quantity" value={quantity(jobCard.orderedQuantity)} /><Field label="Production Type" value={jobCard.productionType} /><Field label="Casting" value={jobCard.casting} /><Field label="Material Grade" value={jobCard.materialGrade} /><Field label="Rod Type / Size" value={`${display(jobCard.rodType)} / ${display(jobCard.rodSize)}`} /><Field label="Weight / 100 pcs" value={jobCard.weight100Pieces} /><Field label="Pieces / Kg" value={jobCard.piecesPerKg} /><Field label="Product Delivery Default" value={deliveryTarget.productDefaultWorkingDays ? `${quantity(deliveryTarget.productDefaultWorkingDays)} working days` : "Not set"} /></dl>
        <div><h3 className="mb-2 flex items-center gap-2 font-semibold"><Route className="size-4" /> Route Options</h3><div className="flex flex-wrap gap-2">{routes.length ? routes.map((routeRow) => <Badge key={text(routeRow.id)} variant={routeRow.selected ? "default" : "outline"}>{display(routeRow.routeCode)} · {display(routeRow.name)}{routeRow.selected ? " · Selected" : ""}</Badge>) : <span className="text-sm text-muted-foreground">No route master for this production unit.</span>}</div></div>
        <div className="grid gap-2"><h3 className="flex items-center gap-2 font-semibold"><Factory className="size-4" /> Setup Masters</h3>{setups.length ? setups.map((setup) => <SetupMaster key={text(setup.id)} setup={setup} />) : <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">Select a route in Planner Actions to load its setup masters.</p>}</div>
      </CardContent></Card> : null}

      {activeTab === "setup" ? <section className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Setups" value={quantity(setupTimings.length)} /><Metric label="Machinist Time" value={`${quantity(setupTimings.reduce((sum, row) => sum + number(row.machinistSetupMinutes), 0))} min`} note="setting start to setting complete" /><Metric label="QC Wait" value={`${quantity(setupTimings.reduce((sum, row) => sum + number(row.qcWaitMinutes), 0))} min`} /><Metric label="Start Wait" value={`${quantity(setupTimings.reduce((sum, row) => sum + number(row.machineStartWaitMinutes), 0))} min`} /></div>
        <Card><CardHeader><CardTitle className="flex items-center gap-2"><Settings2 className="size-4" /> Setup-wise Time</CardTitle><CardDescription>Target comes from Cycle Master. Missing timestamps remain blank and are not counted as zero.</CardDescription></CardHeader><CardContent><div className="overflow-x-auto rounded-md border"><Table><TableHeader><TableRow><TableHead>Setup</TableHead><TableHead>Operation</TableHead><TableHead className="text-right">Target</TableHead><TableHead className="text-right">Machinist</TableHead><TableHead className="text-right">Variance</TableHead><TableHead className="text-right">QC Wait</TableHead><TableHead className="text-right">Start Wait</TableHead></TableRow></TableHeader><TableBody>{setupTimings.length ? setupTimings.map((row) => <TableRow key={text(row.setupId)}><TableCell className="font-medium">{display(row.setupNumber)}</TableCell><TableCell>{display(row.operationName || row.operationCode)}</TableCell><TableCell className="text-right">{row.targetSetupMinutes == null ? "-" : `${quantity(row.targetSetupMinutes)} min`}</TableCell><TableCell className="text-right">{row.machinistSetupMinutes == null ? "-" : `${quantity(row.machinistSetupMinutes)} min`}</TableCell><TableCell className={`text-right ${number(row.setupVarianceMinutes) > 0 ? "text-destructive" : ""}`}>{row.setupVarianceMinutes == null ? "-" : `${number(row.setupVarianceMinutes) > 0 ? "+" : ""}${quantity(row.setupVarianceMinutes)} min`}</TableCell><TableCell className="text-right">{row.qcWaitMinutes == null ? "-" : `${quantity(row.qcWaitMinutes)} min`}</TableCell><TableCell className="text-right">{row.machineStartWaitMinutes == null ? "-" : `${quantity(row.machineStartWaitMinutes)} min`}</TableCell></TableRow>) : <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">No setup timing recorded yet.</TableCell></TableRow>}</TableBody></Table></div></CardContent></Card>
      </section> : null}

      {activeTab === "production" ? <section className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Finished Good" value={hasFinishedOutput ? quantity(analytics.actualGoodPieces) : "-"} note={hasFinishedOutput ? `${quantity(completion, 1)}% of order` : `Waiting for Setup ${finalSetupNumber || "-"}`} /><Metric label="Final Setup Output" value={hasFinishedOutput ? quantity(analytics.actualProducedPieces) : "-"} note={hasFinishedOutput ? "includes final-setup rejection" : "No finished output yet"} /><Metric label="Runtime" value={`${quantity(analytics.runtimeMinutes)} min`} /><Metric label="Sessions" value={quantity(analytics.sessionCount)} /></div>
        <Card><CardHeader><CardTitle>Material Yield & Shortfall</CardTitle><CardDescription>Estimated from received and remaining kilograms using Product Master pieces/kg.</CardDescription></CardHeader><CardContent className="grid gap-3">{material.available === false ? <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">Set Pieces / Kg in Product Master to calculate material capacity and process loss.</div> : null}<div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4"><Field label="Expected From Received RM" value={piecesEstimate(material.expectedPiecesFromMaterial)} /><Field label="Remaining RM Equivalent" value={piecesEstimate(material.remainingMaterialEquivalentPieces)} /><Field label="Rejected" value={`${quantity(material.rejectedPieces)} pcs`} /><Field label="Unexplained Process Loss" value={piecesEstimate(material.unexplainedLossPieces)} /><Field label="Order Short" value={`${quantity(material.orderShortPieces)} pcs`} /><Field label="Casting / RM Capacity Short" value={piecesEstimate(material.materialCapacityShortPieces)} /><Field label="Received RM" value={`${quantity(material.receivedKg, 3)} kg`} /><Field label="Ordered RM" value={`${quantity(material.orderedKg, 3)} kg`} /></div></CardContent></Card>
        <Card><CardHeader><CardTitle>Production Sessions</CardTitle><CardDescription>Setup-level machine and operator entries. Output before the final setup is WIP.</CardDescription></CardHeader><CardContent><div className="overflow-x-auto rounded-md border"><Table excelFilters><TableHeader><TableRow><TableHead>Session</TableHead><TableHead>Machine</TableHead><TableHead>Setup</TableHead><TableHead>Operator</TableHead><TableHead>Started</TableHead><TableHead>Ended</TableHead><TableHead className="text-right">Setup Output</TableHead><TableHead className="text-right">Setup Rejected</TableHead><TableHead className="text-right">Setup Good</TableHead></TableRow></TableHeader><TableBody>{sessions.length ? sessions.map((row) => <TableRow key={text(row.id)}><TableCell><span className="font-medium">{display(row.session_reference)}</span><Badge className="ml-2" variant={text(row.status) === "open" ? "default" : "outline"}>{title(row.status)}</Badge></TableCell><TableCell>{display(row.machine_number)}</TableCell><TableCell>{display(row.setup_number)}</TableCell><TableCell>{display(row.operator_code)}</TableCell><TableCell>{date(row.started_at, true)}</TableCell><TableCell>{date(row.ended_at, true)}</TableCell><TableCell className="text-right">{quantity(row.total_pieces)}</TableCell><TableCell className="text-right">{quantity(row.quantity_rejected)}</TableCell><TableCell className="text-right">{quantity(row.quantity_good)}</TableCell></TableRow>) : <TableRow><TableCell colSpan={9} className="py-10 text-center text-muted-foreground">No production sessions recorded.</TableCell></TableRow>}</TableBody></Table></div></CardContent></Card>
        <Card><CardHeader><CardTitle>Production Plan</CardTitle><CardDescription>Planner rows for this Job Card.</CardDescription></CardHeader><CardContent><div className="overflow-x-auto rounded-md border"><Table><TableHeader><TableRow><TableHead>Machine</TableHead><TableHead>Setup</TableHead><TableHead>Start</TableHead><TableHead>End</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>{planRows.length ? planRows.map((row, index) => <TableRow key={`${value(row, "machineNo", "machineNumber")}-${index}`}><TableCell>{value(row, "machineNo", "machineNumber") || "-"}</TableCell><TableCell>{value(row, "setupNo", "setupNumber") || "-"}</TableCell><TableCell>{date(value(row, "plannedProductionStartDate", "productionStartDate"))}</TableCell><TableCell>{date(value(row, "plannedProductionEndDate", "productionEndDate"))}</TableCell><TableCell>{title(value(row, "runningStatus", "status", "shopFloorStage"))}</TableCell></TableRow>) : <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No plan rows available.</TableCell></TableRow>}</TableBody></Table></div></CardContent></Card>
      </section> : null}

      {activeTab === "rejection" ? <section className="grid gap-4"><div className="grid gap-3 sm:grid-cols-3"><Metric label="Rejected Pieces" value={quantity(analytics.rejectedPieces)} /><Metric label="Rejection Rate" value={`${quantity(analytics.rejectionPercent, 2)}%`} /><Metric label="Rejection Entries" value={quantity(rejectionEvents.length)} /></div><Card><CardHeader><CardTitle className="flex items-center gap-2"><ShieldAlert className="size-4" /> Rejection Pattern</CardTitle><CardDescription>Largest rejection reasons appear first.</CardDescription></CardHeader><CardContent><PatternBars emptyText="No rejection recorded." rows={rejectionPatterns} valueKey="quantity" /></CardContent></Card><Card><CardHeader><CardTitle>Rejection Log</CardTitle></CardHeader><CardContent><EventTable emptyText="No rejection entries recorded." rows={rejectionEvents} /></CardContent></Card></section> : null}

      {activeTab === "downtime" ? <section className="grid gap-4"><div className="grid gap-3 sm:grid-cols-3"><Metric label="Downtime" value={`${quantity(analytics.downtimeMinutes)} min`} /><Metric label="Entries" value={quantity(downtimeEvents.length)} /><Metric label="Largest Reason" value={display(list(analytics.downtimeByReason)[0]?.name)} /></div><div className="grid gap-4 xl:grid-cols-2"><Card><CardHeader><CardTitle>By Reason</CardTitle></CardHeader><CardContent><PatternBars emptyText="No downtime recorded." rows={list(analytics.downtimeByReason)} /></CardContent></Card><Card><CardHeader><CardTitle>By Setup</CardTitle></CardHeader><CardContent><PatternBars emptyText="No downtime recorded." rows={list(analytics.downtimeBySetup)} /></CardContent></Card></div><Card><CardHeader><CardTitle>Downtime Log</CardTitle></CardHeader><CardContent><EventTable emptyText="No downtime entries recorded." rows={downtimeEvents} /></CardContent></Card></section> : null}

      {activeTab === "delivery" ? <section className="grid gap-4"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Delivery Rating" value={display(delivery.rating)} note={display(delivery.status)} /><Metric label="RM Complete" value={date(material.rawMaterialCompleteDate)} /><Metric label="Target Date" value={date(delivery.targetDate)} /><Metric label="Effective Target" value={deliveryTarget.effectiveWorkingDays ? `${quantity(deliveryTarget.effectiveWorkingDays)} days` : "Not set"} note={title(deliveryTarget.source)} /></div><Card><CardHeader><CardTitle className="flex items-center gap-2"><Truck className="size-4" /> Delivery Target</CardTitle><CardDescription>Working days after full RM receipt. Fridays and Planning Calendar holidays are excluded.</CardDescription></CardHeader><CardContent className="grid gap-4"><div className="grid gap-4 md:grid-cols-2"><div className="grid gap-2"><Label htmlFor="product-delivery-days">Product Master default</Label><Input id="product-delivery-days" inputMode="numeric" min={1} max={365} type="number" value={productDays} onChange={(event) => setProductDays(event.target.value)} placeholder="e.g. 20" /><p className="text-xs text-muted-foreground">Applies to Job Cards for {display(jobCard.partCode)} unless overridden.</p></div><div className="grid gap-2"><Label htmlFor="job-card-delivery-days">This Job Card override</Label><Input id="job-card-delivery-days" inputMode="numeric" min={1} max={365} type="number" value={overrideDays} onChange={(event) => setOverrideDays(event.target.value)} placeholder="Leave blank to use Product Master" /><p className="text-xs text-muted-foreground">Optional. Leave blank to use the Product Master default.</p></div></div><div className="flex flex-wrap items-center gap-3"><Button disabled={saving || !productDays} onClick={() => void saveDeliveryTarget()}><Save /> {saving ? "Saving…" : "Save Target"}</Button>{saveMessage ? <p className="text-sm text-muted-foreground" role="status">{saveMessage}</p> : null}</div></CardContent></Card><Card><CardHeader><CardTitle>Raw Material Receipts</CardTitle><CardDescription>Delivery timing starts when cumulative receipts reach ordered RM kilograms.</CardDescription></CardHeader><CardContent><div className="overflow-x-auto rounded-md border"><Table><TableHeader><TableRow><TableHead>Receipt</TableHead><TableHead>Date</TableHead><TableHead>Heat No.</TableHead><TableHead>Supplier</TableHead><TableHead className="text-right">Received Kg</TableHead><TableHead className="text-right">Remaining Kg</TableHead></TableRow></TableHeader><TableBody>{receipts.length ? receipts.map((row, index) => <TableRow key={`${text(row.receiptNumber)}-${index}`}><TableCell>{display(row.receiptNumber)}</TableCell><TableCell>{date(row.receivedOn)}</TableCell><TableCell>{display(row.heatNumber)}</TableCell><TableCell>{display(row.supplierName)}</TableCell><TableCell className="text-right">{quantity(row.quantityKg, 3)}</TableCell><TableCell className="text-right">{quantity(row.remainingQuantityKg, 3)}</TableCell></TableRow>) : <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">No linked raw material receipts.</TableCell></TableRow>}</TableBody></Table></div></CardContent></Card></section> : null}

      {activeTab === "log" ? <Card><CardHeader><CardTitle className="flex items-center gap-2"><History className="size-4" /> Complete Job Card Log</CardTitle><CardDescription>Production, setup, downtime, rejection and workflow events in one sortable table.</CardDescription></CardHeader><CardContent><EventTable emptyText="No Job Card events recorded." rows={events} /></CardContent></Card> : null}
    </> : null}
  </main>
}
