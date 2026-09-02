"use client"

import {
  productionSessionOperationalStatus,
  productionShiftAt,
  type ProductionSessionOperationalStatus,
} from "@workspace/db/production-session-domain"
import {
  productionFloors,
  type ProductionFloorCode,
} from "@workspace/db/production-floors"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { SectionCard, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { NativeSelect, NativeSelectOption } from "@workspace/ui/components/native-select"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@workspace/ui/components/sheet"
import { OperationalTable, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@workspace/ui/components/table"
import { Clock3, History, Play, Search, Square, TriangleAlert } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"

import { useDashboardDelivery } from "@/hooks/use-dashboard-delivery"
import { DataDownloadButton } from "@/components/data-download-button"
import { dashboardPayloadFromState, dashboardPayloadForProductionFloor } from "@/lib/dashboard-view-model"
import {
  formatIstDateTime,
  istDateTimeInputParts,
  istDateTimeInputToIso,
  istDateTimeInputValue,
} from "@/lib/date-time"
import { productionPieceWeightGrams } from "@/lib/production-session-entry"
import {
  carriedDowntimeRows,
  type CarriedDowntimeRow,
} from "@/lib/production-session-downtime"
import {
  productionSessionActionDefaults,
  productionSessionCarriedStartCount,
  productionSessionStartOptions,
  type ProductionSessionMachineOption,
} from "@/lib/production-session-start"
import { productionShopFloorOptions } from "@/lib/shared-employee-master"

type View = "start" | "register" | "events"
type SessionStatusFilter = "all" | ProductionSessionOperationalStatus
type Action =
  | "start"
  | "end"
  | "downtime"
  | "downtimeEnd"
  | "carryResolve"
  | "rejection"
type Row = Record<string, unknown>

const text = (value: unknown) => String(value ?? "").trim()
const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0
const rows = (value: unknown): Row[] => Array.isArray(value) ? value.filter((item): item is Row => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : []
const first = (row: Row, keys: string[]) => keys.map((key) => text(row[key])).find(Boolean) ?? ""
const machine = (row: Row) => first(row, ["machineNumber", "machineNo", "machine", "machineCode"])
const job = (row: Row) => first(row, ["jobCardNumber", "jobCard", "jcNo", "JC NO."])
const part = (row: Row) => first(row, ["partCode", "partNo", "itemCode", "partUid"])
const setup = (row: Row) => first(row, ["setupNumber", "setupNo", "operationSetupCode"])
const option = (row: Row) => first(row, ["optionNumber", "optionNo"])
const formatDateTime = (value: unknown) => formatIstDateTime(text(value))
const titleCase = (value: unknown) => text(value).replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) || "-"
const endReasons = [
  { label: "Shift Ends", value: "shift_end" },
  { label: "Shift Change", value: "shift_change" },
  { label: "Operator Change", value: "operator_change" },
  { label: "Item Complete", value: "item_complete" },
  { label: "Job / Setup Change", value: "job_change" },
  { label: "Manual Stop", value: "manual_stop" },
]

function sessionOperationalStatus(
  row: Row,
  floor: ProductionFloorCode,
  instant: Date
) {
  const status = text(row.status).toLowerCase() === "closed" ? "closed" : "open"
  try {
    return productionSessionOperationalStatus(
      {
        productionDate: text(row.productionDate),
        productionFloorCode: floor,
        shift: text(row.shift),
        status,
      },
      instant
    )
  } catch {
    return status
  }
}

function masterOptions(value: unknown, labelKeys: string[]) {
  return rows(value).map((row) => ({
    code: first(row, ["code", "uid", "id"]),
    label: first(row, labelKeys),
  })).filter((item) => item.code && text(rows(value).find((row) => first(row, ["code", "uid", "id"]) === item.code)?.status).toLowerCase() !== "inactive")
}

async function api(path: string, init?: RequestInit) {
  const response = await fetch(path, { cache: "no-store", credentials: "same-origin", ...init })
  const body = await response.json().catch(() => ({})) as Row
  if (!response.ok) throw new Error(text(body.error) || text(body.message) || "Request failed.")
  return body
}

export function ProductionSessionsWorkspace({ initialFloor }: { initialFloor: ProductionFloorCode }) {
  const floor = initialFloor
  const unit = productionFloors.find((item) => item.code === floor)!
  const [view, setView] = useState<View>("start")
  const [sessions, setSessions] = useState<Row[]>([])
  const [eventRows, setEventRows] = useState<Row[]>([])
  const [employees, setEmployees] = useState<Array<{ code: string; name: string }>>([])
  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<SessionStatusFilter>("all")
  const [now, setNow] = useState(() => new Date())
  const [selectedMachine, setSelectedMachine] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)
  const [action, setAction] = useState<Action | null>(null)
  const [target, setTarget] = useState<Row | null>(null)
  const [detail, setDetail] = useState<Row | null>(null)
  const [detailEvents, setDetailEvents] = useState<Row[]>([])
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const { state } = useDashboardDelivery({ floor })
  const dashboard = dashboardPayloadFromState(state.data)
  const floorPayload = dashboardPayloadForProductionFloor(dashboard, floor)
  const control = useMemo(() => (
    floorPayload.productionControl && typeof floorPayload.productionControl === "object"
      ? floorPayload.productionControl
      : {}
  ) as Row, [floorPayload.productionControl])
  const shift = productionShiftAt(floor, new Date())

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const [sessionBody, eventsBody, employeeBody] = await Promise.all([
        api(`/api/production-sessions?floor=${encodeURIComponent(floor)}&limit=500`),
        api(`/api/production-sessions?view=events&floor=${encodeURIComponent(floor)}&limit=1000`),
        api("/api/employee-master"),
      ])
      setSessions(rows(sessionBody.rows))
      setEventRows(rows(eventsBody.rows))
      setEmployees(productionShopFloorOptions(rows(employeeBody.rows), floor))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Production sessions could not be loaded.")
    } finally {
      setLoading(false)
    }
  }, [floor])

  useEffect(() => {
    queueMicrotask(() => void load())
  }, [load])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const visibleSessions = useMemo(() => {
    const needle = query.toLowerCase()
    return sessions.filter((row) => {
      const matchesQuery = !needle || [row.sessionReference, row.machineNumber, row.jobCardNumber, row.partCode, row.operatorCode, row.operatorName].some((value) => text(value).toLowerCase().includes(needle))
      const matchesStatus = statusFilter === "all" || sessionOperationalStatus(row, floor, now) === statusFilter
      return matchesQuery && matchesStatus
    })
  }, [floor, now, query, sessions, statusFilter])
  const closingRequiredSessions = useMemo(
    () => sessions.filter((row) => sessionOperationalStatus(row, floor, now) === "closing_required"),
    [floor, now, sessions]
  )
  const machineOptions = useMemo(() => productionSessionStartOptions({
    planRows: rows(control.machinePlanDetailRows),
    sessions,
  }), [control.machinePlanDetailRows, sessions])
  const carriedDowntime = useMemo(
    () => carriedDowntimeRows(sessions),
    [sessions]
  )
  const selectedOption = useMemo(
    () => machineOptions.find(({ machineNumber }) => machineNumber.toLowerCase() === selectedMachine.toLowerCase()),
    [machineOptions, selectedMachine]
  )

  function openAction(next: Action, row: Row) {
    const carriedStartCount = next === "start"
      ? productionSessionCarriedStartCount(row, sessions)
      : undefined
    setTarget(carriedStartCount !== undefined
      ? { ...row, carriedStartCount }
      : row)
    setAction(next)
    setMessage("")
  }

  async function openDetail(row: Row) {
    setDetail(row)
    setDetailEvents([])
    try {
      const body = await api(`/api/production-sessions?view=events&sessionId=${encodeURIComponent(text(row.id))}&limit=500`)
      setDetailEvents(rows(body.rows))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Session events could not be loaded.")
    }
  }

  async function save(entryType: string, payload: Row) {
    setSaving(true)
    setMessage("")
    try {
      const body = await api("/api/data-entry", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ entryType, key: crypto.randomUUID(), payload: { ...payload, productionFloorCode: floor } }) })
      setMessage(text(body.savedText) || "Saved.")
      setAction(null)
      await load()
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Entry could not be saved.")
    } finally {
      setSaving(false)
    }
  }

  function exportCsv() {
    const source = view === "events" ? eventRows : visibleSessions
    if (!source.length) return
    const keys = Object.keys(source[0]!)
    const csv = [keys.join(","), ...source.map((row) => keys.map((key) => `"${text(row[key]).replaceAll('"', '""')}"`).join(","))].join("\n")
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }))
    const link = document.createElement("a")
    link.href = url
    link.download = `production-${view}-${floor}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="grid gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-xl font-semibold">Production Sessions</h1>
          <div className="flex flex-wrap items-center gap-2">
            {closingRequiredSessions.length ? <Button className="h-8 px-3" variant="destructive" onClick={() => { setStatusFilter("closing_required"); setView("register") }}><TriangleAlert />Closing Required · {closingRequiredSessions.length}</Button> : null}
            <Badge variant="secondary" className="h-8 px-3">{unit.shortLabel}</Badge>
            <Badge variant="outline" className="h-8 px-3">{shift ? `${shift.shift} · ${shift.productionDate}` : "Outside production shift"}</Badge>
          </div>
        </div>

 <SectionCard>
          <CardHeader className="gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>{view === "start" ? "Start a session" : view === "register" ? "Session Register" : "Event Log"}</CardTitle>
              <div className="flex flex-wrap gap-2">
                {([['start','Start Session'],['register','Session Register'],['events','Event Log']] as const).map(([id, label]) => <Button key={id} className="h-11" variant={view === id ? "default" : "outline"} onClick={() => setView(id)}>{id === "start" ? <Play /> : id === "register" ? <History /> : <Clock3 />}{label}</Button>)}
              </div>
            </div>
            {view !== "start" ? <div className="flex flex-wrap gap-2">
              <div className="relative min-w-56 flex-1"><Search className="absolute left-3 top-3.5 size-4 text-muted-foreground" /><Input className="h-11 pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search machine, job, part or operator" /></div>
              {view === "register" ? <NativeSelect className="h-11 w-52" aria-label="Session status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as SessionStatusFilter)}><NativeSelectOption value="all">All statuses</NativeSelectOption><NativeSelectOption value="closing_required">Closing Required ({closingRequiredSessions.length})</NativeSelectOption><NativeSelectOption value="open">Open</NativeSelectOption><NativeSelectOption value="closed">Closed</NativeSelectOption></NativeSelect> : null}
              <DataDownloadButton label="Download CSV" onClick={exportCsv} />
            </div> : null}
          </CardHeader>
          <CardContent>
            {error ? <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div> : null}
            {message ? <div className="mb-3 rounded-md border bg-muted p-3 text-sm">{message}</div> : null}
            {loading ? <div className="p-10 text-center text-muted-foreground">Loading production sessions…</div> : view === "start" ? <div className="grid gap-4"><CarriedDowntimePanel rows={carriedDowntime} sessions={sessions} options={machineOptions} onSelect={setSelectedMachine} onAction={openAction} /><StartSessionLookup options={machineOptions} selected={selectedOption} shift={shift} floor={floor} now={now} onSelect={setSelectedMachine} onAction={openAction} onDetail={(row) => void openDetail(row)} /></div> : view === "register" ? <Register rows={visibleSessions} floor={floor} now={now} onAction={openAction} onDetail={(row) => void openDetail(row)} /> : <EventLog rows={eventRows.filter((row) => !query || Object.values(row).some((value) => text(value).toLowerCase().includes(query.toLowerCase())))} />}
          </CardContent>
 </SectionCard>
      <ActionSheet key={`${action}-${text(target?.id) || machine(target ?? {})}`} action={action} target={target} floor={floor} shift={shift} employees={employees} control={control} saving={saving} message={message} onOpenChange={(open) => { if (!open) setAction(null) }} onSave={(type, payload) => void save(type, payload)} />
      <DetailSheet session={detail} events={detailEvents} floor={floor} now={now} onOpenChange={(open) => { if (!open) setDetail(null) }} />
    </div>
  )
}

function CarriedDowntimePanel({ rows: carriedRows, sessions, options, onSelect, onAction }: {
  rows: CarriedDowntimeRow[]
  sessions: Row[]
  options: ProductionSessionMachineOption[]
  onSelect: (machineNumber: string) => void
  onAction: (action: Action, row: Row) => void
}) {
  if (!carriedRows.length) return null
 return <div className="rounded-lg border border-[var(--color-warning)]/30 bg-[var(--color-warning-bg)] p-4 "><div className="mb-3"><div className="font-semibold">Unresolved downtime</div><div className="text-sm text-muted-foreground">Problems carried from a previous shift. Off-shift hours are not counted.</div></div><div className="grid gap-3">{carriedRows.map((row) => {
    const currentSession = sessions.find((session) => text(session.status) === "open" && machine(session).toLowerCase() === row.machineNumber.toLowerCase())
    const sameSession = currentSession && text(currentSession.id) === text(row.session.id)
    const canSelect = options.some((item) => item.machineNumber.toLowerCase() === row.machineNumber.toLowerCase())
    const carryTarget = {
      ...row.session,
      eventId: row.eventId,
      machineNumber: row.machineNumber,
      reasonCode: row.reasonCode,
      reasonName: row.reasonName,
    }
    return <div key={`${row.machineNumber}-${row.eventId}`} className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-background p-3"><div><div className="font-medium">{row.machineNumber} · {row.reasonCode || "Downtime"}</div><div className="text-sm text-muted-foreground">{row.reasonName || "Unresolved machine problem"}</div><div className="mt-1 text-xs text-muted-foreground">{row.state === "open" ? `Current interval started ${formatDateTime(row.startedAt)}` : `Previous interval closed ${formatDateTime(row.endedAt)}`}</div></div><div className="flex flex-wrap gap-2">{row.state === "open" && currentSession ? <Button className="h-10" variant="destructive" onClick={() => onAction("downtimeEnd", currentSession)}>Close downtime</Button> : sameSession ? <Button className="h-10" onClick={() => onAction("end", currentSession)}>End session</Button> : currentSession ? <Button className="h-10" onClick={() => onAction("downtime", { ...currentSession, carriedReasonCode: row.reasonCode, carriedReasonName: row.reasonName, carriedStartAt: currentSession.startedAt })}>Continue this shift</Button> : <Button className="h-10" disabled={!canSelect} onClick={() => onSelect(row.machineNumber)}>Select machine</Button>}{row.state === "carried" ? <Button className="h-10" variant="outline" onClick={() => onAction("carryResolve", carryTarget)}>Mark resolved</Button> : null}</div></div>
  })}</div></div>
}

function StartSessionLookup({ options, selected, shift, floor, now, onSelect, onAction, onDetail }: { options: ProductionSessionMachineOption[]; selected?: ProductionSessionMachineOption; shift: ReturnType<typeof productionShiftAt>; floor: ProductionFloorCode; now: Date; onSelect: (machineNumber: string) => void; onAction: (action: Action, row: Row) => void; onDetail: (row: Row) => void }) {
  const plan = selected?.plan
  const session = selected?.session
  const pieceWeight = plan ? productionPieceWeightGrams(plan) : 0
  const operationalStatus = session ? sessionOperationalStatus(session, floor, now) : null
  return <div className="mx-auto grid max-w-4xl gap-4">
    <Field label="Machine number"><NativeSelect value={selected?.machineNumber ?? ""} onChange={(event) => onSelect(event.target.value)}><NativeSelectOption value="">Select running machine</NativeSelectOption>{options.map((option) => <NativeSelectOption key={option.machineNumber} value={option.machineNumber}>{option.machineNumber} · {part(option.plan) || "No planned part"} · JC {job(option.plan) || "-"}</NativeSelectOption>)}</NativeSelect></Field>
    {!selected ? <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">{options.length ? "Select a running machine to fetch its current planning information." : "No machines are currently running in this Production Unit."}</div> : null}
    {selected && plan ? <div className="rounded-lg border bg-background p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-lg font-semibold">{selected.machineNumber}</div><div className="text-sm text-muted-foreground">Planning details to verify before entry</div></div><Badge variant={operationalStatus === "closing_required" ? "destructive" : session ? "default" : "secondary"}>{operationalStatus === "closing_required" ? "Closing Required" : session ? (session.hasOpenDowntime ? "Downtime" : "Running") : "Ready to start"}</Badge></div>
      <div className="mt-4 grid gap-x-6 gap-y-3 rounded-md bg-muted/40 p-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <PlanField label="Job Card" value={job(plan)} />
        <PlanField label="Part" value={part(plan)} />
        <PlanField label="Option / Setup" value={`${option(plan) || "-"} / ${setup(plan) || "-"}`} />
        <PlanField label="Setup" value={first(plan, ["setupName", "operationName"])} />
        <PlanField label="Planned quantity" value={first(plan, ["orderPcs", "plannedQuantity", "quantity"])} />
        <PlanField label="Planning status" value={first(plan, ["runningStatus", "shopFloorStageLabel", "shopFloorStage"])} />
        <PlanField label="Planned run" value={`${first(plan, ["plannedProductionStartDate", "plannedStartDate"]) || "-"} → ${first(plan, ["plannedProductionEndDate", "plannedCompletionDate"]) || "-"}`} />
        <PlanField label="Cycle time" value={first(plan, ["cycleTime", "cycleTimeSeconds", "cycleTimeSec"]) ? `${first(plan, ["cycleTime", "cycleTimeSeconds", "cycleTimeSec"])} sec` : ""} />
        <PlanField label="Piece weight" value={pieceWeight ? `${pieceWeight} g` : "Not configured"} />
        {session ? <><PlanField label="Operator" value={`${text(session.operatorCode)} · ${text(session.operatorName)}`} /><PlanField label="Started" value={formatDateTime(session.startedAt)} /><PlanField label="Session" value={text(session.sessionReference)} /></> : null}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">{session ? <><Button className="h-11" variant="outline" onClick={() => onDetail(session)}><History />View Session</Button><Button className="h-11" variant="outline" disabled={Boolean(session.hasOpenDowntime)} title={session.hasOpenDowntime ? "Close the open downtime before ending this session." : undefined} onClick={() => onAction("end", session)}><Square />End</Button>{session.hasOpenDowntime ? <Button className="h-11" variant="destructive" onClick={() => onAction("downtimeEnd", session)}><Clock3 />Close downtime</Button> : <Button className="h-11" variant="outline" onClick={() => onAction("downtime", session)}><Clock3 />Start downtime</Button>}<Button className="h-11" variant="outline" onClick={() => onAction("rejection", session)}><TriangleAlert />Rejection</Button></> : <Button className="h-11" disabled={!shift || !pieceWeight} onClick={() => onAction("start", plan)}><Play />Enter operator and start details</Button>}</div>
 {session?.hasOpenDowntime ? <p className="mt-2 text-sm text-[var(--color-warning-text)] ">Close the open downtime before ending this production session.</p> : null}
      {!session && !shift ? <p className="mt-2 text-sm text-destructive">A session can be started only during the Production Unit&apos;s configured shift.</p> : null}
      {!session && !pieceWeight ? <p className="mt-2 text-sm text-destructive">A positive piece weight is required in the Route or Cycle Time Master.</p> : null}
    </div> : null}
  </div>
}

function PlanField({ label, value }: { label: string; value: unknown }) {
  return <div><div className="text-xs text-muted-foreground">{label}</div><div className="font-medium">{text(value) || "-"}</div></div>
}

function Register({ rows, floor, now, onAction, onDetail }: { rows: Row[]; floor: ProductionFloorCode; now: Date; onAction: (action: Action, row: Row) => void; onDetail: (row: Row) => void }) {
  return <ScrollableTable headers={["Session", "Machine", "Job / Part", "Operator", "Shift", "Start / End", "Produced", "Rejected", "Good", "Downtime", "Action"]}>{rows.map((row) => {
    const status = sessionOperationalStatus(row, floor, now)
    const closingRequired = status === "closing_required"
    const action = row.hasOpenDowntime ? "downtimeEnd" : "end"
 return <TableRow key={text(row.id)} className={`cursor-pointer ${closingRequired ? "bg-[var(--color-warning-bg)] hover:bg-[var(--color-warning-bg)] dark:hover:bg-[var(--color-warning-bg)]" : ""}`} onClick={() => onDetail(row)}><TableCell><div className="font-mono text-xs font-medium">{text(row.sessionReference) || text(row.id).slice(0, 8)}</div><Badge className="mt-1" variant={closingRequired ? "destructive" : status === "open" ? "default" : "secondary"}>{titleCase(status)}</Badge></TableCell><TableCell className="font-medium">{machine(row)}</TableCell><TableCell>{job(row)}<div className="text-xs text-muted-foreground">{part(row)} · Setup {setup(row)}</div></TableCell><TableCell>{text(row.operatorCode)}<div className="text-xs text-muted-foreground">{text(row.operatorName)}</div></TableCell><TableCell>{text(row.shift)}<div className="text-xs text-muted-foreground">{text(row.productionDate)}</div></TableCell><TableCell className="whitespace-nowrap text-xs">{formatDateTime(row.startedAt)}<br />{text(row.endedAt) ? formatDateTime(row.endedAt) : closingRequired ? "Shift ended" : "Running"}</TableCell><TableCell className="text-right tabular-nums">{number(row.totalPieces)}</TableCell><TableCell className="text-right tabular-nums">{number(row.rejectedPieces)}</TableCell><TableCell className="text-right font-medium tabular-nums">{number(row.goodPieces)}</TableCell><TableCell className="text-right tabular-nums">{number(row.downtimeMinutes)} min</TableCell><TableCell>{closingRequired ? <Button className="h-9 whitespace-nowrap" variant={row.hasOpenDowntime ? "destructive" : "default"} onClick={(event) => { event.stopPropagation(); onAction(action, row) }}>{row.hasOpenDowntime ? "Close downtime" : "Close session"}</Button> : "-"}</TableCell></TableRow>
  })}</ScrollableTable>
}

function EventLog({ rows }: { rows: Row[] }) {
  return <ScrollableTable headers={["Time", "Session", "Machine", "Event", "Entered by", "Details", "Qty / Min"]}>{rows.map((row, index) => <TableRow key={`${text(row.eventId)}-${index}`}><TableCell className="whitespace-nowrap text-xs">{formatDateTime(row.eventTime)}</TableCell><TableCell className="font-mono text-xs">{text(row.sessionReference)}</TableCell><TableCell>{text(row.machineNumber)}</TableCell><TableCell><Badge variant="outline">{titleCase(row.eventType)}</Badge></TableCell><TableCell>{titleCase(row.enteredRole)}<div className="text-xs text-muted-foreground">{text(row.enteredByName) || "-"}</div></TableCell><TableCell>{text(row.reasonName) || "-"}</TableCell><TableCell className="text-right tabular-nums">{number(row.quantity) || number(row.durationMinutes) || "-"}</TableCell></TableRow>)}</ScrollableTable>
}

function SessionTimeline({ rows }: { rows: Row[] }) {
  if (!rows.length) {
    return <div className="grid min-h-32 place-items-center rounded-md border text-muted-foreground">No session events yet.</div>
  }
  return <div className="min-h-0 flex-1 overflow-y-auto rounded-md border">{rows.map((row, index) => {
    const detail = text(row.reasonName) || text(row.eventDetails) || "-"
    const quantity = number(row.quantity) || number(row.durationMinutes)
    return <div key={`${text(row.eventId)}-${index}`} className="grid min-w-0 gap-3 border-b p-3 last:border-b-0 sm:grid-cols-2 lg:grid-cols-[10rem_11rem_minmax(9rem,1fr)_minmax(12rem,1.4fr)_5rem] lg:items-center">
      <div><div className="text-xs text-muted-foreground lg:hidden">Time</div><div className="whitespace-nowrap text-xs">{formatDateTime(row.eventTime)}</div></div>
      <div><div className="text-xs text-muted-foreground lg:hidden">Event</div><Badge variant="outline">{titleCase(row.eventType)}</Badge></div>
      <div className="min-w-0"><div className="text-xs text-muted-foreground lg:hidden">Entered by</div><div>{titleCase(row.enteredRole)}</div><div className="truncate text-xs text-muted-foreground">{text(row.enteredByName) || "-"}</div></div>
      <div className="min-w-0"><div className="text-xs text-muted-foreground lg:hidden">Details</div><div className="break-words">{detail}</div></div>
      <div><div className="text-xs text-muted-foreground lg:hidden">Qty / Min</div><div className="tabular-nums lg:text-right">{quantity || "-"}</div></div>
    </div>
  })}</div>
}

function ScrollableTable({ headers, children }: { headers: string[]; children: React.ReactNode }) {
 return <div className="max-h-[65vh] overflow-auto rounded-md border"><OperationalTable containerClassName="max-h-none overflow-visible"><TableHeader className="sticky top-0 z-10 bg-background"><TableRow>{headers.map((header) => <TableHead key={header}>{header}</TableHead>)}</TableRow></TableHeader><TableBody>{children}</TableBody></OperationalTable></div>
}

function ActionSheet({ action, target, floor, shift, employees, control, saving, message, onOpenChange, onSave }: { action: Action | null; target: Row | null; floor: ProductionFloorCode; shift: ReturnType<typeof productionShiftAt>; employees: Array<{ code: string; name: string }>; control: Row; saving: boolean; message: string; onOpenChange: (open: boolean) => void; onSave: (entryType: string, payload: Row) => void }) {
  const defaults = productionSessionActionDefaults(floor, new Date(), {
    action: action === "downtime" ? "downtime" : undefined,
    productionDate: text(target?.productionDate),
    shift: text(target?.shift),
  })
  const [operator, setOperator] = useState("")
  const storedMethod = text(target?.measurementMethod)
  const [method, setMethod] = useState<"weight" | "counter">(
    storedMethod === "weight" || storedMethod === "counter"
      ? storedMethod
      : floor === "cnc" ? "counter" : "weight"
  )
  const actualNow = istDateTimeInputValue(new Date())
  const [startAt, setStartAt] = useState(
    text(target?.carriedStartAt)
      ? istDateTimeInputValue(text(target?.carriedStartAt))
      : defaults.startAt
  )
  const [endAt, setEndAt] = useState(
    action === "downtimeEnd" || action === "carryResolve"
      ? actualNow
      : defaults.endAt
  )
  const [startCount, setStartCount] = useState("")
  const [endCount, setEndCount] = useState("")
  const [grossKg, setGrossKg] = useState("")
  const [crates, setCrates] = useState("")
  const [endReason, setEndReason] = useState<string>(defaults.endReason)
  const [downtimeEndOutcome, setDowntimeEndOutcome] = useState<
    "resolved" | "shift_end_unresolved"
  >("resolved")
  const [role, setRole] = useState("shop_floor")
  const [reason, setReason] = useState(text(target?.carriedReasonCode))
  const [typeCode, setTypeCode] = useState("")
  const [remark, setRemark] = useState("")
  const [quantity, setQuantity] = useState("")
  const reasonOptions = masterOptions(control.rejectionReasonMasterRows, ["rejectionReason", "reason", "name", "downtimeReason", "description"])
  const typeOptions = masterOptions(control.rejectionTypeMasterRows, ["typeOfRejection", "rejectionType", "name"])
  const remarkOptions = masterOptions(control.rejectionRemarkMasterRows, ["rejectionRemark", "remark", "name"])
  if (!target) return null
  const plan = target
  const pieceWeight = productionPieceWeightGrams(plan)
  const sessionId = text(target.id)
  const selectedReason = reasonOptions.find((item) => item.code === reason)
  const selectedType = typeOptions.find((item) => item.code === typeCode)
  const selectedRemark = remarkOptions.find((item) => item.code === remark)
  const startAtIso = istDateTimeInputToIso(startAt)
  const endAtIso = istDateTimeInputToIso(endAt)
  const submit = () => {
    if (action === "start") onSave("production_session_start", { machine: machine(plan), jobCard: job(plan), setupNo: setup(plan), operatorCode: operator, measurementMethod: method, startCount: method === "counter" && !text(plan.carriedStartCount) ? number(startCount) : undefined, startedAt: startAtIso, cycleTime: number(first(plan, ["cycleTime", "cycleTimeSeconds", "cycleTimeSec"])), pieceWeightGrams: pieceWeight })
    if (action === "end") onSave("production_session_close", { sessionId, enteredRole: role, endedAt: endAtIso, endReason, endCount: method === "counter" ? number(endCount) : undefined, grossWeightKg: method === "weight" ? number(grossKg) : undefined, crateCount: method === "weight" ? number(crates) : undefined, crateWeightKg: method === "weight" ? 2 : undefined })
    if (action === "downtime") onSave("production_session_downtime_start", { sessionId, enteredRole: role, startedAt: startAtIso, reasonCode: reason, reasonName: selectedReason?.label || text(target.carriedReasonName) })
    if (action === "downtimeEnd") onSave("production_session_downtime_end", { sessionId, endedAt: endAtIso, endOutcome: downtimeEndOutcome })
    if (action === "carryResolve") onSave("production_session_downtime_carry_resolve", { eventId: target.eventId, resolvedAt: endAtIso })
    if (action === "rejection") onSave("production_session_rejection", { sessionId, quantity: number(quantity), typeCode, typeName: selectedType?.label, reasonCode: reason, reasonName: selectedReason?.label, remarkCode: remark, remarkName: selectedRemark?.label })
  }
  const valid = action === "start" ? Boolean(operator && startAtIso && method && pieceWeight > 0 && (method === "weight" || startCount || text(plan.carriedStartCount))) : action === "end" ? Boolean(endAtIso && endReason && (method === "counter" ? endCount : grossKg && crates)) : action === "downtime" ? Boolean(reason && startAtIso && role) : action === "downtimeEnd" || action === "carryResolve" ? Boolean(endAtIso) : action === "rejection" ? Boolean(typeCode && reason && remark && number(quantity) > 0) : false
  const sheetTitle = action === "downtime" ? "Start downtime" : action === "downtimeEnd" ? "Close downtime" : action === "carryResolve" ? "Resolve carried downtime" : `${titleCase(action)} production session`
  const saveLabel = action === "downtime" ? "Start downtime" : action === "downtimeEnd" ? "Close downtime" : action === "carryResolve" ? "Mark resolved" : `Save ${titleCase(action)}`
  return <Sheet open={Boolean(action)} onOpenChange={onOpenChange}><SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg"><SheetHeader><SheetTitle>{sheetTitle}</SheetTitle><SheetDescription>{machine(target)} · {job(target)} · {part(target)} · Setup {setup(target)}</SheetDescription></SheetHeader><div className="grid gap-4 px-6">
    {action === "start" ? <><Field label="Operator"><NativeSelect value={operator} onChange={(event) => setOperator(event.target.value)}><NativeSelectOption value="">Select operator</NativeSelectOption>{employees.map((employee) => <NativeSelectOption key={employee.code} value={employee.code}>{employee.code} · {employee.name}</NativeSelectOption>)}</NativeSelect></Field><IstDateTimeField label="Start time (IST)" value={startAt} onChange={setStartAt} /><Field label="Production method"><NativeSelect value={method} onChange={(event) => setMethod(event.target.value as "weight" | "counter")}><NativeSelectOption value="weight">Weight at session end</NativeSelectOption>{floor === "cnc" ? <NativeSelectOption value="counter">Machine counter</NativeSelectOption> : null}</NativeSelect></Field>{method === "counter" ? text(plan.carriedStartCount) ? <div className="rounded-md bg-muted p-3 text-sm">Start count carried from the previous matching session: <b>{text(plan.carriedStartCount)}</b></div> : <Field label="Machine start count"><Input inputMode="numeric" type="number" min="0" value={startCount} onChange={(event) => setStartCount(event.target.value)} /></Field> : null}<div className="rounded-md bg-muted p-3 text-sm">Shift and production date are automatic: <b>{shift?.shift ?? "Outside shift"} · {shift?.productionDate ?? "-"}</b></div></> : null}
    {action === "end" ? <><IstDateTimeField label="End time (IST)" value={endAt} onChange={setEndAt} /><Field label="End reason"><NativeSelect value={endReason} onChange={(event) => setEndReason(event.target.value)}>{endReasons.map(({ label, value }) => <NativeSelectOption key={value} value={value}>{label}</NativeSelectOption>)}</NativeSelect></Field><Field label="Entry role"><NativeSelect value={role} onChange={(event) => setRole(event.target.value)}><NativeSelectOption value="shop_floor">Shop Floor</NativeSelectOption>{floor === "cnc" ? <NativeSelectOption value="quality">QC</NativeSelectOption> : null}</NativeSelect></Field><Field label="Production method"><NativeSelect value={method} onChange={(event) => setMethod(event.target.value as "weight" | "counter")}><NativeSelectOption value="weight">Weight</NativeSelectOption>{floor === "cnc" ? <NativeSelectOption value="counter">Machine counter</NativeSelectOption> : null}</NativeSelect></Field>{method === "counter" ? <Field label="Machine end count"><Input inputMode="numeric" type="number" min="0" value={endCount} onChange={(event) => setEndCount(event.target.value)} /></Field> : <div className="grid grid-cols-2 gap-3"><Field label="Gross produced kg"><Input inputMode="decimal" type="number" min="0" step="0.001" value={grossKg} onChange={(event) => setGrossKg(event.target.value)} /></Field><Field label="Crates used"><Input inputMode="numeric" type="number" min="0" step="1" value={crates} onChange={(event) => setCrates(event.target.value)} /></Field></div>}</> : null}
 {action === "downtime" ? <><Field label="Entered by"><NativeSelect value={role} onChange={(event) => setRole(event.target.value)}><NativeSelectOption value="shop_floor">Shop Floor</NativeSelectOption><NativeSelectOption value="machinist">Machinist</NativeSelectOption><NativeSelectOption value="quality">QC</NativeSelectOption></NativeSelect></Field>{text(target.carriedReasonName) ? <div className="rounded-md bg-[var(--color-warning-bg)] p-3 text-sm "><div className="text-xs text-muted-foreground">Continuing carried problem</div><div className="font-medium">{reason} · {text(target.carriedReasonName)}</div></div> : <Field label="Downtime reason"><MasterSelect value={reason} options={reasonOptions} onChange={setReason} placeholder="Select downtime reason" /></Field>}<IstDateTimeField label="Downtime starts (IST)" value={startAt} onChange={setStartAt} /><p className="text-sm text-muted-foreground">Close this downtime with an actual end time before resuming production or ending the session.</p></> : null}
 {action === "downtimeEnd" ? <><IstDateTimeField label="Downtime end (IST)" value={endAt} onChange={setEndAt} /><Field label="Closure outcome"><NativeSelect value={downtimeEndOutcome} onChange={(event) => { const outcome = event.target.value as "resolved" | "shift_end_unresolved"; setDowntimeEndOutcome(outcome); setEndAt(outcome === "shift_end_unresolved" ? defaults.endAt : istDateTimeInputValue(new Date())) }}><NativeSelectOption value="resolved">Resolved — Resume production</NativeSelectOption><NativeSelectOption value="shift_end_unresolved">Shift ended — Unresolved</NativeSelectOption></NativeSelect></Field>{downtimeEndOutcome === "shift_end_unresolved" ? <div className="rounded-md bg-[var(--color-warning-bg)] p-3 text-sm ">The interval ends at this shift&apos;s end. The machine problem remains in Unresolved Downtime for the next shift; off-shift hours are excluded.</div> : null}</> : null}
    {action === "carryResolve" ? <><IstDateTimeField label="Problem resolved at (IST)" value={endAt} onChange={setEndAt} /><div className="rounded-md bg-muted p-3 text-sm">Use this when the machine was repaired before another production shift interval was started. No off-shift hours will be counted as production downtime.</div></> : null}
    {action === "rejection" ? <><Field label="Rejection type"><MasterSelect value={typeCode} options={typeOptions} onChange={setTypeCode} placeholder="Select rejection type" /></Field><Field label="Rejection reason"><MasterSelect value={reason} options={reasonOptions} onChange={setReason} placeholder="Select rejection reason" /></Field><Field label="Rejection remark"><MasterSelect value={remark} options={remarkOptions} onChange={setRemark} placeholder="Select remark" /></Field><Field label="Rejected pieces"><Input inputMode="numeric" type="number" min="1" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></Field><p className="text-sm text-muted-foreground">Counter difference includes rejected pieces. Good pieces are calculated automatically.</p></> : null}
    {message ? <div className="rounded-md border p-3 text-sm">{message}</div> : null}
  </div><SheetFooter><Button className="h-11" disabled={!valid || saving} onClick={submit}>{saving ? "Saving…" : saveLabel}</Button></SheetFooter></SheetContent></Sheet>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="grid gap-1.5 text-sm font-medium"><span>{label}</span>{children}</label> }
function IstDateTimeField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const parts = istDateTimeInputParts(value)
  return <fieldset className="grid gap-1.5 text-sm font-medium"><legend>{label}</legend><div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-2"><Input aria-label={`${label} date`} type="date" value={parts.date} onChange={(event) => onChange(`${event.target.value}T${parts.time}`)} /><Input aria-label={`${label} in 24-hour format`} inputMode="numeric" maxLength={5} pattern="([01][0-9]|2[0-3]):[0-5][0-9]" placeholder="HH:mm" title="Use 24-hour IST time as HH:mm" type="text" value={parts.time} onChange={(event) => onChange(`${parts.date}T${event.target.value}`)} /></div></fieldset>
}
function MasterSelect({ value, options, onChange, placeholder }: { value: string; options: Array<{ code: string; label: string }>; onChange: (value: string) => void; placeholder: string }) { return <NativeSelect value={value} onChange={(event) => onChange(event.target.value)}><NativeSelectOption value="">{options.length ? placeholder : "No active master values configured"}</NativeSelectOption>{options.map((item) => <NativeSelectOption key={item.code} value={item.code}>{item.code} · {item.label}</NativeSelectOption>)}</NativeSelect> }

function DetailSheet({ session, events, floor, now, onOpenChange }: { session: Row | null; events: Row[]; floor: ProductionFloorCode; now: Date; onOpenChange: (open: boolean) => void }) {
  if (!session) return null
  const status = sessionOperationalStatus(session, floor, now)
  return <Sheet open onOpenChange={onOpenChange}><SheetContent side="right" className="h-full !w-full gap-0 overflow-hidden sm:!max-w-4xl xl:!max-w-5xl"><SheetHeader className="shrink-0 border-b"><SheetTitle>{text(session.sessionReference) || "Production session"}</SheetTitle><SheetDescription>{machine(session)} · {job(session)} · {part(session)} · Setup {setup(session)}</SheetDescription></SheetHeader><div className="flex min-h-0 flex-1 flex-col gap-4 p-6"><div className="grid shrink-0 grid-cols-2 gap-3 rounded-lg bg-muted/50 p-4 sm:grid-cols-4">{[["Status",titleCase(status)],["Operator",`${text(session.operatorCode)} ${text(session.operatorName)}`],["Started",formatDateTime(session.startedAt)],["Ended",text(session.endedAt) ? formatDateTime(session.endedAt) : status === "closing_required" ? "Closing required" : "Running"],["Total",number(session.totalPieces)],["Rejected",number(session.rejectedPieces)],["Good",number(session.goodPieces)],["Downtime",`${number(session.downtimeMinutes)} min`]].map(([label,value]) => <div className="min-w-0" key={String(label)}><div className="text-xs text-muted-foreground">{label}</div><div className="truncate font-medium">{value}</div></div>)}</div><div className="flex min-h-0 flex-1 flex-col"><h3 className="mb-2 shrink-0 font-medium">Session timeline</h3><SessionTimeline rows={events} /></div></div></SheetContent></Sheet>
}
