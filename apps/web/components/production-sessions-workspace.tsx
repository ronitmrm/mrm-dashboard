"use client"

import { productionShiftAt } from "@workspace/db/production-session-domain"
import {
  normalizeProductionFloorCode,
  productionFloors,
  type ProductionFloorCode,
} from "@workspace/db/production-floors"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { NativeSelect, NativeSelectOption } from "@workspace/ui/components/native-select"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@workspace/ui/components/sheet"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@workspace/ui/components/table"
import { Activity, Clock3, Download, History, Play, Search, Square, TriangleAlert } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"

import { useDashboardDelivery } from "@/hooks/use-dashboard-delivery"
import { dashboardPayloadFromState, dashboardPayloadForProductionFloor } from "@/lib/dashboard-view-model"

type View = "board" | "register" | "events"
type Action = "start" | "end" | "downtime" | "rejection"
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
const isoLocal = (date: Date) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}
const formatDateTime = (value: unknown) => {
  const date = new Date(text(value))
  return Number.isNaN(date.getTime()) ? "-" : new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(date)
}
const titleCase = (value: unknown) => text(value).replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) || "-"

function plannerRows(control: Row) {
  const source = rows(control.machinePlanDetailRows)
  const byMachine = new Map<string, Row[]>()
  for (const row of source) {
    const key = machine(row).toLowerCase()
    if (!key) continue
    byMachine.set(key, [...(byMachine.get(key) ?? []), row])
  }
  return [...byMachine.values()].map((items) => items.find((row) => {
    const stage = text(row.shopFloorStage).toLowerCase()
    const status = text(row.runningStatus).toLowerCase()
    return stage !== "item_complete" && (status === "running" || ["quality_approval", "operator_started", "worker_start"].includes(stage))
  }) ?? items.find((row) => text(row.shopFloorStage).toLowerCase() !== "item_complete") ?? items[0]!)
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
  const [floor, setFloor] = useState(initialFloor)
  const [view, setView] = useState<View>("board")
  const [sessions, setSessions] = useState<Row[]>([])
  const [eventRows, setEventRows] = useState<Row[]>([])
  const [employees, setEmployees] = useState<Array<{ code: string; name: string }>>([])
  const [query, setQuery] = useState("")
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
  const plans = useMemo(() => plannerRows(control), [control])
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
      const options = rows(employeeBody.productionShopFloorOptions ?? employeeBody.rows)
      setEmployees(options.map((row) => ({ code: first(row, ["code", "employeeCode", "uid"]), name: first(row, ["name", "employeeName", "fullName"]) })).filter((item) => item.code))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Production sessions could not be loaded.")
    } finally {
      setLoading(false)
    }
  }, [floor])

  useEffect(() => {
    queueMicrotask(() => void load())
  }, [load])

  const visibleSessions = useMemo(() => {
    const needle = query.toLowerCase()
    return sessions.filter((row) => !needle || [row.sessionReference, row.machineNumber, row.jobCardNumber, row.partCode, row.operatorCode, row.operatorName].some((value) => text(value).toLowerCase().includes(needle)))
  }, [query, sessions])
  const openByMachine = useMemo(() => new Map(sessions.filter((row) => text(row.status) === "open").map((row) => [machine(row).toLowerCase(), row])), [sessions])
  const board = useMemo(() => {
    const result = plans.map((plan) => ({ plan, session: openByMachine.get(machine(plan).toLowerCase()) }))
    for (const session of sessions.filter((row) => text(row.status) === "open")) {
      if (!result.some((item) => machine(item.plan).toLowerCase() === machine(session).toLowerCase())) result.push({ plan: session, session })
    }
    const needle = query.toLowerCase()
    return result.filter(({ plan, session }) => !needle || [machine(plan), job(plan), part(plan), setup(plan), session?.operatorCode].some((value) => text(value).toLowerCase().includes(needle)))
  }, [openByMachine, plans, query, sessions])

  function openAction(next: Action, row: Row) {
    const previous = next === "start"
      ? sessions.filter((session) => text(session.status) === "closed"
          && machine(session).toLowerCase() === machine(row).toLowerCase()
          && job(session).toLowerCase() === job(row).toLowerCase()
          && part(session).toLowerCase() === part(row).toLowerCase()
          && setup(session).toLowerCase() === setup(row).toLowerCase())
        .sort((left, right) => text(right.endedAt).localeCompare(text(left.endedAt)))[0]
      : undefined
    setTarget(previous && text(previous.measurementMethod) === "counter" && text(previous.endCount)
      ? { ...row, carriedStartCount: previous.endCount }
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

  async function resume(session: Row) {
    await save("production_session_downtime_end", { sessionId: session.id, endedAt: new Date().toISOString() })
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

  const running = sessions.filter((row) => text(row.status) === "open").length
  const openDowntime = sessions.filter((row) => Boolean(row.hasOpenDowntime)).length

  return (
    <div className="grid gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h1 className="text-xl font-semibold">Production Sessions</h1><p className="text-sm text-muted-foreground">One place to start, stop, review and analyse every machine session.</p></div>
          <div className="flex flex-wrap items-center gap-2">
            <NativeSelect className="h-11 w-48" value={floor} onChange={(event) => { const next = normalizeProductionFloorCode(event.target.value); setFloor(next); history.replaceState(null, "", `/dashboard/production-sessions?floor=${next}`) }}>
              {productionFloors.map((item) => <NativeSelectOption key={item.code} value={item.code}>{item.shortLabel}</NativeSelectOption>)}
            </NativeSelect>
            <Badge variant="outline" className="h-8 px-3">{shift ? `${shift.shift} · ${shift.productionDate}` : "Outside production shift"}</Badge>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Metric label="Running" value={running} detail="open sessions" />
          <Metric label="Downtime" value={openDowntime} detail="machines stopped now" alert={openDowntime > 0} />
          <Metric label="Today" value={sessions.filter((row) => text(row.productionDate) === shift?.productionDate).length} detail="sessions recorded" />
        </div>

        <Card>
          <CardHeader className="gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><CardTitle>Daily Machine Board</CardTitle><CardDescription>Planner details are shown directly against each machine.</CardDescription></div>
              <div className="flex flex-wrap gap-2">
                {([['board','Daily Board'],['register','Session Register'],['events','Event Log']] as const).map(([id, label]) => <Button key={id} className="h-11" variant={view === id ? "default" : "outline"} onClick={() => setView(id)}>{id === "board" ? <Activity /> : id === "register" ? <History /> : <Clock3 />}{label}</Button>)}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="relative min-w-56 flex-1"><Search className="absolute left-3 top-3.5 size-4 text-muted-foreground" /><Input className="h-11 pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search machine, job, part or operator" /></div>
              {view !== "board" ? <Button className="h-11" variant="outline" onClick={exportCsv}><Download />Export CSV</Button> : null}
            </div>
          </CardHeader>
          <CardContent>
            {error ? <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div> : null}
            {message ? <div className="mb-3 rounded-md border bg-muted p-3 text-sm">{message}</div> : null}
            {loading ? <div className="p-10 text-center text-muted-foreground">Loading production sessions…</div> : view === "board" ? <Board rows={board} floor={floor} onAction={openAction} onResume={(row) => void resume(row)} onDetail={(row) => void openDetail(row)} /> : view === "register" ? <Register rows={visibleSessions} onDetail={(row) => void openDetail(row)} /> : <EventLog rows={eventRows.filter((row) => !query || Object.values(row).some((value) => text(value).toLowerCase().includes(query.toLowerCase())))} />}
          </CardContent>
        </Card>
      <ActionSheet key={`${action}-${text(target?.id) || machine(target ?? {})}`} action={action} target={target} floor={floor} shift={shift} employees={employees} control={control} saving={saving} message={message} onOpenChange={(open) => { if (!open) setAction(null) }} onSave={(type, payload) => void save(type, payload)} />
      <DetailSheet session={detail} events={detailEvents} onOpenChange={(open) => { if (!open) setDetail(null) }} />
    </div>
  )
}

function Metric({ label, value, detail, alert = false }: { label: string; value: number; detail: string; alert?: boolean }) {
  return <Card className={alert ? "border-amber-500/50" : ""}><CardContent className="flex items-center justify-between p-4"><div><div className="text-sm text-muted-foreground">{label}</div><div className="text-xs text-muted-foreground">{detail}</div></div><div className="text-2xl font-semibold tabular-nums">{value}</div></CardContent></Card>
}

function Board({ rows: boardRows, floor, onAction, onResume, onDetail }: { rows: Array<{ plan: Row; session?: Row }>; floor: ProductionFloorCode; onAction: (action: Action, row: Row) => void; onResume: (row: Row) => void; onDetail: (row: Row) => void }) {
  if (!boardRows.length) return <div className="rounded-md border border-dashed p-10 text-center text-muted-foreground">No planner machine cards are available for this floor.</div>
  return <div className="grid gap-3 xl:grid-cols-2">{boardRows.map(({ plan, session }) => <div key={`${machine(plan)}-${job(plan)}-${setup(plan)}`} className="rounded-lg border bg-background p-4">
    <div className="flex items-start justify-between gap-3"><div><div className="text-lg font-semibold">{machine(plan) || "Machine"}</div><div className="text-sm text-muted-foreground">{part(plan) || "No part"} · JC {job(plan) || "-"} · Setup {setup(plan) || "-"} · Option {option(plan) || "-"}</div></div><Badge variant={session ? "default" : "secondary"}>{session ? (session.hasOpenDowntime ? "Downtime" : "Running") : "Not started"}</Badge></div>
    <div className="mt-3 grid grid-cols-2 gap-2 rounded-md bg-muted/40 p-3 text-sm sm:grid-cols-4"><span><b>Cycle</b><br />{first(plan, ["cycleTime", "cycleTimeSeconds", "cycleTimeSec"]) || "-"} sec</span><span><b>Piece wt.</b><br />{first(plan, ["pieceWeightGrams", "pieceWeight", "weightPerPiece"]) || "-"} g</span><span><b>Operator</b><br />{session ? `${text(session.operatorCode)} ${text(session.operatorName)}` : "Assign at start"}</span><span><b>Session</b><br /><button className="font-mono text-xs underline" disabled={!session} onClick={() => session && onDetail(session)}>{text(session?.sessionReference) || "Not created"}</button></span></div>
    <div className="mt-3 flex flex-wrap gap-2">{session ? <><Button className="h-11" variant="outline" onClick={() => onAction("end", session)}><Square />End</Button>{session.hasOpenDowntime ? <Button className="h-11" variant="destructive" onClick={() => onResume(session)}><Play />Resume</Button> : <Button className="h-11" variant="outline" onClick={() => onAction("downtime", session)}><Clock3 />Downtime</Button>}<Button className="h-11" variant="outline" onClick={() => onAction("rejection", session)}><TriangleAlert />Rejection</Button></> : <Button className="h-11" disabled={!productionShiftAt(floor, new Date())} onClick={() => onAction("start", plan)}><Play />Start Session</Button>}</div>
  </div>)}</div>
}

function Register({ rows, onDetail }: { rows: Row[]; onDetail: (row: Row) => void }) {
  return <ScrollableTable headers={["Session", "Machine", "Job / Part", "Operator", "Shift", "Start / End", "Produced", "Rejected", "Good", "Downtime"]}>{rows.map((row) => <TableRow key={text(row.id)} className="cursor-pointer" onClick={() => onDetail(row)}><TableCell><div className="font-mono text-xs font-medium">{text(row.sessionReference) || text(row.id).slice(0, 8)}</div><Badge className="mt-1" variant={text(row.status) === "open" ? "default" : "secondary"}>{titleCase(row.status)}</Badge></TableCell><TableCell className="font-medium">{machine(row)}</TableCell><TableCell>{job(row)}<div className="text-xs text-muted-foreground">{part(row)} · Setup {setup(row)}</div></TableCell><TableCell>{text(row.operatorCode)}<div className="text-xs text-muted-foreground">{text(row.operatorName)}</div></TableCell><TableCell>{text(row.shift)}<div className="text-xs text-muted-foreground">{text(row.productionDate)}</div></TableCell><TableCell className="whitespace-nowrap text-xs">{formatDateTime(row.startedAt)}<br />{text(row.endedAt) ? formatDateTime(row.endedAt) : "Running"}</TableCell><TableCell className="text-right tabular-nums">{number(row.totalPieces)}</TableCell><TableCell className="text-right tabular-nums">{number(row.rejectedPieces)}</TableCell><TableCell className="text-right font-medium tabular-nums">{number(row.goodPieces)}</TableCell><TableCell className="text-right tabular-nums">{number(row.downtimeMinutes)} min</TableCell></TableRow>)}</ScrollableTable>
}

function EventLog({ rows }: { rows: Row[] }) {
  return <ScrollableTable headers={["Time", "Session", "Machine", "Event", "Entered by", "Details", "Qty / Min"]}>{rows.map((row, index) => <TableRow key={`${text(row.eventId)}-${index}`}><TableCell className="whitespace-nowrap text-xs">{formatDateTime(row.eventTime)}</TableCell><TableCell className="font-mono text-xs">{text(row.sessionReference)}</TableCell><TableCell>{text(row.machineNumber)}</TableCell><TableCell><Badge variant="outline">{titleCase(row.eventType)}</Badge></TableCell><TableCell>{titleCase(row.enteredRole)}<div className="text-xs text-muted-foreground">{text(row.enteredByName) || "-"}</div></TableCell><TableCell>{text(row.reasonName) || "-"}</TableCell><TableCell className="text-right tabular-nums">{number(row.quantity) || number(row.durationMinutes) || "-"}</TableCell></TableRow>)}</ScrollableTable>
}

function ScrollableTable({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return <div className="max-h-[65vh] overflow-auto rounded-md border"><Table><TableHeader className="sticky top-0 z-10 bg-background"><TableRow>{headers.map((header) => <TableHead key={header}>{header}</TableHead>)}</TableRow></TableHeader><TableBody>{children}</TableBody></Table></div>
}

function ActionSheet({ action, target, floor, shift, employees, control, saving, message, onOpenChange, onSave }: { action: Action | null; target: Row | null; floor: ProductionFloorCode; shift: ReturnType<typeof productionShiftAt>; employees: Array<{ code: string; name: string }>; control: Row; saving: boolean; message: string; onOpenChange: (open: boolean) => void; onSave: (entryType: string, payload: Row) => void }) {
  const [operator, setOperator] = useState("")
  const storedMethod = text(target?.measurementMethod)
  const [method, setMethod] = useState<"weight" | "counter">(
    storedMethod === "weight" || storedMethod === "counter"
      ? storedMethod
      : floor === "cnc" ? "counter" : "weight"
  )
  const [startAt, setStartAt] = useState(isoLocal(new Date()))
  const [endAt, setEndAt] = useState(isoLocal(new Date()))
  const [startCount, setStartCount] = useState("")
  const [endCount, setEndCount] = useState("")
  const [grossKg, setGrossKg] = useState("")
  const [crates, setCrates] = useState("")
  const [endReason, setEndReason] = useState("shift_change")
  const [role, setRole] = useState("shop_floor")
  const [reason, setReason] = useState("")
  const [typeCode, setTypeCode] = useState("")
  const [remark, setRemark] = useState("")
  const [quantity, setQuantity] = useState("")
  const reasonOptions = masterOptions(control.rejectionReasonMasterRows, ["rejectionReason", "reason", "name", "downtimeReason", "description"])
  const typeOptions = masterOptions(control.rejectionTypeMasterRows, ["typeOfRejection", "rejectionType", "name"])
  const remarkOptions = masterOptions(control.rejectionRemarkMasterRows, ["rejectionRemark", "remark", "name"])
  if (!target) return null
  const plan = target
  const sessionId = text(target.id)
  const selectedReason = reasonOptions.find((item) => item.code === reason)
  const selectedType = typeOptions.find((item) => item.code === typeCode)
  const selectedRemark = remarkOptions.find((item) => item.code === remark)
  const submit = () => {
    if (action === "start") onSave("production_session_start", { machine: machine(plan), jobCard: job(plan), setupNo: setup(plan), operatorCode: operator, measurementMethod: method, startCount: method === "counter" && !text(plan.carriedStartCount) ? number(startCount) : undefined, startedAt: new Date(startAt).toISOString(), cycleTime: number(first(plan, ["cycleTime", "cycleTimeSeconds", "cycleTimeSec"])), pieceWeightGrams: number(first(plan, ["pieceWeightGrams", "pieceWeight", "weightPerPiece"])) })
    if (action === "end") onSave("production_session_close", { sessionId, enteredRole: role, endedAt: new Date(endAt).toISOString(), endReason, endCount: method === "counter" ? number(endCount) : undefined, grossWeightKg: method === "weight" ? number(grossKg) : undefined, crateCount: method === "weight" ? number(crates) : undefined, crateWeightKg: method === "weight" ? 2 : undefined })
    if (action === "downtime") onSave("production_session_downtime_start", { sessionId, enteredRole: role, startedAt: new Date(startAt).toISOString(), reasonCode: reason, reasonName: selectedReason?.label })
    if (action === "rejection") onSave("production_session_rejection", { sessionId, quantity: number(quantity), typeCode, typeName: selectedType?.label, reasonCode: reason, reasonName: selectedReason?.label, remarkCode: remark, remarkName: selectedRemark?.label })
  }
  const valid = action === "start" ? Boolean(operator && startAt && method && (method === "weight" || startCount || text(plan.carriedStartCount))) : action === "end" ? Boolean(endAt && endReason && (method === "counter" ? endCount : grossKg && crates)) : action === "downtime" ? Boolean(reason && startAt && role) : action === "rejection" ? Boolean(typeCode && reason && remark && number(quantity) > 0) : false
  return <Sheet open={Boolean(action)} onOpenChange={onOpenChange}><SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg"><SheetHeader><SheetTitle>{titleCase(action)} production session</SheetTitle><SheetDescription>{machine(target)} · {job(target)} · {part(target)} · Setup {setup(target)}</SheetDescription></SheetHeader><div className="grid gap-4 px-6">
    {action === "start" ? <><Field label="Operator"><NativeSelect value={operator} onChange={(event) => setOperator(event.target.value)}><NativeSelectOption value="">Select operator</NativeSelectOption>{employees.map((employee) => <NativeSelectOption key={employee.code} value={employee.code}>{employee.code} · {employee.name}</NativeSelectOption>)}</NativeSelect></Field><Field label="Start time"><Input type="datetime-local" value={startAt} onChange={(event) => setStartAt(event.target.value)} /></Field><Field label="Production method"><NativeSelect value={method} onChange={(event) => setMethod(event.target.value as "weight" | "counter")}><NativeSelectOption value="weight">Weight at session end</NativeSelectOption>{floor === "cnc" ? <NativeSelectOption value="counter">Machine counter</NativeSelectOption> : null}</NativeSelect></Field>{method === "counter" ? text(plan.carriedStartCount) ? <div className="rounded-md bg-muted p-3 text-sm">Start count carried from the previous matching session: <b>{text(plan.carriedStartCount)}</b></div> : <Field label="Machine start count"><Input inputMode="numeric" type="number" min="0" value={startCount} onChange={(event) => setStartCount(event.target.value)} /></Field> : null}<div className="rounded-md bg-muted p-3 text-sm">Shift and production date are automatic: <b>{shift?.shift ?? "Outside shift"} · {shift?.productionDate ?? "-"}</b></div></> : null}
    {action === "end" ? <><Field label="End time"><Input type="datetime-local" value={endAt} onChange={(event) => setEndAt(event.target.value)} /></Field><Field label="End reason"><NativeSelect value={endReason} onChange={(event) => setEndReason(event.target.value)}>{["shift_change","operator_change","item_complete","job_change","manual_stop"].map((value) => <NativeSelectOption key={value} value={value}>{titleCase(value)}</NativeSelectOption>)}</NativeSelect></Field><Field label="Entry role"><NativeSelect value={role} onChange={(event) => setRole(event.target.value)}><NativeSelectOption value="shop_floor">Shop Floor</NativeSelectOption>{floor === "cnc" ? <NativeSelectOption value="quality">QC</NativeSelectOption> : null}</NativeSelect></Field><Field label="Production method"><NativeSelect value={method} onChange={(event) => setMethod(event.target.value as "weight" | "counter")}><NativeSelectOption value="weight">Weight</NativeSelectOption>{floor === "cnc" ? <NativeSelectOption value="counter">Machine counter</NativeSelectOption> : null}</NativeSelect></Field>{method === "counter" ? <Field label="Machine end count"><Input inputMode="numeric" type="number" min="0" value={endCount} onChange={(event) => setEndCount(event.target.value)} /></Field> : <div className="grid grid-cols-2 gap-3"><Field label="Gross produced kg"><Input inputMode="decimal" type="number" min="0" step="0.001" value={grossKg} onChange={(event) => setGrossKg(event.target.value)} /></Field><Field label="Crates used"><Input inputMode="numeric" type="number" min="0" step="1" value={crates} onChange={(event) => setCrates(event.target.value)} /></Field></div>}</> : null}
    {action === "downtime" ? <><Field label="Entered by"><NativeSelect value={role} onChange={(event) => setRole(event.target.value)}><NativeSelectOption value="shop_floor">Shop Floor</NativeSelectOption><NativeSelectOption value="machinist">Machinist</NativeSelectOption><NativeSelectOption value="quality">QC</NativeSelectOption></NativeSelect></Field><Field label="Downtime reason"><MasterSelect value={reason} options={reasonOptions} onChange={setReason} placeholder="Select downtime reason" /></Field><Field label="Downtime starts"><Input type="datetime-local" value={startAt} onChange={(event) => setStartAt(event.target.value)} /></Field><p className="text-sm text-muted-foreground">Use Resume on the machine card when production restarts.</p></> : null}
    {action === "rejection" ? <><Field label="Rejection type"><MasterSelect value={typeCode} options={typeOptions} onChange={setTypeCode} placeholder="Select rejection type" /></Field><Field label="Rejection reason"><MasterSelect value={reason} options={reasonOptions} onChange={setReason} placeholder="Select rejection reason" /></Field><Field label="Rejection remark"><MasterSelect value={remark} options={remarkOptions} onChange={setRemark} placeholder="Select remark" /></Field><Field label="Rejected pieces"><Input inputMode="numeric" type="number" min="1" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></Field><p className="text-sm text-muted-foreground">Counter difference includes rejected pieces. Good pieces are calculated automatically.</p></> : null}
    {message ? <div className="rounded-md border p-3 text-sm">{message}</div> : null}
  </div><SheetFooter><Button className="h-11" disabled={!valid || saving} onClick={submit}>{saving ? "Saving…" : `Save ${titleCase(action)}`}</Button></SheetFooter></SheetContent></Sheet>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="grid gap-1.5 text-sm font-medium"><span>{label}</span>{children}</label> }
function MasterSelect({ value, options, onChange, placeholder }: { value: string; options: Array<{ code: string; label: string }>; onChange: (value: string) => void; placeholder: string }) { return <NativeSelect value={value} onChange={(event) => onChange(event.target.value)}><NativeSelectOption value="">{options.length ? placeholder : "No active master values configured"}</NativeSelectOption>{options.map((item) => <NativeSelectOption key={item.code} value={item.code}>{item.code} · {item.label}</NativeSelectOption>)}</NativeSelect> }

function DetailSheet({ session, events, onOpenChange }: { session: Row | null; events: Row[]; onOpenChange: (open: boolean) => void }) {
  if (!session) return null
  return <Sheet open onOpenChange={onOpenChange}><SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl"><SheetHeader><SheetTitle>{text(session.sessionReference) || "Production session"}</SheetTitle><SheetDescription>{machine(session)} · {job(session)} · {part(session)} · Setup {setup(session)}</SheetDescription></SheetHeader><div className="grid gap-4 px-6 pb-6"><div className="grid grid-cols-2 gap-3 rounded-lg bg-muted/50 p-4 sm:grid-cols-4">{[["Status",titleCase(session.status)],["Operator",`${text(session.operatorCode)} ${text(session.operatorName)}`],["Started",formatDateTime(session.startedAt)],["Ended",text(session.endedAt) ? formatDateTime(session.endedAt) : "Running"],["Total",number(session.totalPieces)],["Rejected",number(session.rejectedPieces)],["Good",number(session.goodPieces)],["Downtime",`${number(session.downtimeMinutes)} min`]].map(([label,value]) => <div key={String(label)}><div className="text-xs text-muted-foreground">{label}</div><div className="font-medium">{value}</div></div>)}</div><div><h3 className="mb-2 font-medium">Session timeline</h3><EventLog rows={events} /></div></div></SheetContent></Sheet>
}
