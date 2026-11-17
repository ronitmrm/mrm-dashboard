"use client"

import { useEffect, useState, type FormEvent } from "react"
import {
  cncShifts, isShiftIdleReason, shiftCoverageKinds, shiftIdleReasons, shiftReasonRanges, shiftReasonVersion,
  type ShiftCoverageKind, type ShiftGapReview, type ShiftIdleMachine, type ShiftIdleReview, type ShiftSegment,
} from "@workspace/db/shift-idle-reasons"
import { StatusBadge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { NativeSelect, NativeSelectOption } from "@workspace/ui/components/native-select"
import { StandardState } from "@workspace/ui/components/standard-state"
import { OperationalTable, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@workspace/ui/components/table"
import { PlanningRecordCells, PlanningRecordHeaders } from "./planning-record-columns"

const endpoint = "/api/shift-idle-review"
const stageLabels: Record<string, string> = {
  raw_material_at_machine: "Raw material at machine",
  presetting: "Presetting",
  setting: "Setting",
  quality_approval: "Quality approval",
  operator_started: "Operator started",
  released: "Released during shift",
}
const clock = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
const coverageLabels = Object.fromEntries(shiftCoverageKinds) as Record<ShiftCoverageKind, string>
const timelineColors: Record<ShiftCoverageKind, string> = {
  running: "bg-primary",
  breakdown: "bg-destructive",
  maintenance: "bg-chart-5",
  downtime: "bg-chart-3",
  break: "bg-chart-2",
  unclosed: "bg-chart-4",
  reviewed: "bg-muted-foreground",
  gap: "bg-muted",
}

function milliseconds(segment: ShiftSegment) {
  return Date.parse(segment.end) - Date.parse(segment.start)
}

function duration(ms: number) {
  const seconds = Math.round(ms / 1000)
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor(seconds % 3600 / 60)
  const parts = [hours ? `${hours}h` : "", minutes ? `${minutes}m` : "", seconds % 60 ? `${seconds % 60}s` : ""]
  return parts.filter(Boolean).join(" ") || (ms > 0 ? "<1s" : "0m")
}

function timeRange(segment: ShiftSegment) {
  return `${clock.format(new Date(segment.start))}–${clock.format(new Date(segment.end))}`
}

function needsReview(machine: ShiftIdleMachine) {
  return machine.untimedOutput || machine.segments.some(({ kind }) => kind === "gap" || kind === "unclosed")
}

export function ShiftIdleReviewPanel({ initialReview }: { initialReview?: { date: string; shift: string; machine: string } }) {
  const [query, setQuery] = useState(() => initialReview
    ? `?${new URLSearchParams({ date: initialReview.date, shift: initialReview.shift })}` : "")
  const [reload, setReload] = useState(0)
  const [review, setReview] = useState<ShiftIdleReview | null>(null)
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(0)
  const [filter, setFilter] = useState<"pending" | "saved" | "all">(initialReview ? "saved" : "pending")
  const [focusMachine, setFocusMachine] = useState(initialReview?.machine ?? "")

  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      try {
        const response = await fetch(`${endpoint}${query}`, { signal: controller.signal, cache: "no-store" })
        if (!response.ok) throw new Error((await response.json()).error)
        const data: ShiftIdleReview = await response.json()
        if (!controller.signal.aborted) setReview(data)
      } catch (error) {
        if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Try again.")
      }
    }
    void load()
    return () => controller.abort()
  }, [query, reload])

  function loadShift(nextQuery: string) {
    setError("")
    setReview(null)
    setFocusMachine("")
    setQuery(nextQuery)
    setReload((value) => value + 1)
  }

  function selectShift(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const params = new URLSearchParams({ date: String(form.get("date")), shift: String(form.get("shift")) })
    loadShift(`?${params}`)
  }

  if (error) return (
    <StandardState variant="error" title="Could not load shift coverage" description={error}
      action={<Button onClick={() => loadShift("")}>Load latest completed shift</Button>} />
  )
  if (!review) return <StandardState variant="loading" title="Loading shift coverage" description="Checking production and maintenance records." />

  const pending = review.machines.filter(needsReview)
  const savedMachines = review.machines.filter((machine) => machine.segments.some((segment) => segment.review))
  const visible = (filter === "all" ? review.machines : filter === "saved" ? savedMachines : pending)
    .filter((machine) => !focusMachine || machine.machineNumber === focusMachine)
  return (
    <div className="grid min-w-0 gap-4">
      <form onSubmit={selectShift} key={`${review.productionDate}-${review.shift}`}>
        <FieldGroup className="flex-row flex-wrap items-end gap-3">
          <Field className="w-auto">
            <FieldLabel htmlFor="idle-review-date">Production date</FieldLabel>
            <Input id="idle-review-date" name="date" type="date" defaultValue={review.productionDate} required />
          </Field>
          <Field className="w-auto">
            <FieldLabel htmlFor="idle-review-shift">Shift</FieldLabel>
            <NativeSelect id="idle-review-shift" name="shift" defaultValue={review.shift}>
              {cncShifts.map((shift) => <NativeSelectOption key={shift} value={shift}>{shift}</NativeSelectOption>)}
            </NativeSelect>
          </Field>
          <Button type="submit" disabled={saving > 0}>View shift</Button>
          <Button type="button" variant="ghost" onClick={() => loadShift("")} disabled={saving > 0}>Latest completed shift</Button>
        </FieldGroup>
      </form>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm" role="status">
          <strong>{pending.length} of {review.fleetSize} machines</strong> need review for this 8-hour shift
        </p>
        <div className="flex flex-wrap items-center gap-1" aria-label="Machine filter">
          {([["pending", "Needs review"], ["saved", "Saved reasons"], ["all", "All machines"]] as const).map(([value, label]) => (
            <Button key={value} type="button" size="sm" variant={filter === value ? "secondary" : "ghost"}
              aria-pressed={filter === value && !focusMachine} disabled={saving > 0}
              onClick={() => { setFocusMachine(""); setFilter(value) }}>{label}</Button>
          ))}
        </div>
      </div>
      {visible.length ? (
        <OperationalTable aria-label="CNC shift coverage" containerClassName="rounded-lg border">
          <TableHeader><TableRow><PlanningRecordHeaders /><TableHead>Shift breakdown</TableHead></TableRow></TableHeader>
          <TableBody>
            {visible.map((machine) => (
              <ShiftCoverageRow key={machine.machineId} machine={machine} review={review}
                onSaving={(active) => setSaving((count) => count + (active ? 1 : -1))}
                onSaved={(saved) => setReview((current) => current ? {
                  ...current,
                  machines: current.machines.map((row) => row.machineId === machine.machineId ? {
                    ...row, segments: row.segments.map((segment) => {
                      const match = saved.find(({ start, end }) => start === segment.start && end === segment.end)
                      return match ? { ...segment, kind: "reviewed", review: match } : segment
                    }),
                  } : row),
                } : current)} />
            ))}
          </TableBody>
        </OperationalTable>
      ) : <StandardState title={filter === "saved" ? "No saved reasons" : "No machines to review"}
        description={filter === "saved" ? "Saved reasons for this shift will appear here." : "Select All machines to see the full shift breakdown."} />}
    </div>
  )
}

type RowCallbacks = {
  onSaved: (reviews: ShiftGapReview[]) => void
  onSaving: (active: boolean) => void
}

function ShiftCoverageRow({ machine, review, onSaved, onSaving }: RowCallbacks & {
  machine: ShiftIdleMachine
  review: ShiftIdleReview
}) {
  const totals = new Map<ShiftCoverageKind, number>()
  for (const segment of machine.segments)
    totals.set(segment.kind, (totals.get(segment.kind) ?? 0) + milliseconds(segment))
  return (
    <TableRow>
      <PlanningRecordCells floor="cnc" machine={machine.machineNumber} part={machine.item} setup={machine.setup} job={machine.jobCard} />
      <TableCell className="min-w-72 whitespace-normal">
        {machine.stage ? <div className="mb-2 text-xs text-muted-foreground">{stageLabels[machine.stage] ?? machine.stage}</div> : null}
        <div aria-hidden="true" className="flex h-2 overflow-hidden rounded-full bg-muted">
          {machine.segments.map((segment) => (
            <span key={segment.start} className={timelineColors[segment.kind]}
              title={`${timeRange(segment)} ${coverageLabels[segment.kind]}`}
              style={{ flexGrow: milliseconds(segment), flexBasis: 0 }} />
          ))}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs tabular-nums">
          {shiftCoverageKinds.filter(([kind]) => totals.has(kind)).map(([kind, label]) =>
            kind === "gap" || kind === "unclosed"
              ? <StatusBadge key={kind} tone="warning" value={`${duration(totals.get(kind)!)} ${label.toLowerCase()}`} />
              : <span key={kind} className="text-muted-foreground">{label} <strong className="font-medium text-foreground">{duration(totals.get(kind)!)}</strong></span>
          )}
        </div>
        {machine.untimedOutput ? <p className="mt-2 text-xs">Production output has no start or end time. Complete the production record before assigning a reason.</p> : null}
        <MachineReason machine={machine} review={review} onSaved={onSaved} onSaving={onSaving} />
        <details className="mt-2">
          <summary className="w-fit cursor-pointer text-xs font-medium text-primary">View time ranges</summary>
          <ul className="mt-2 grid gap-2">
            {machine.segments.map((segment) => (
              <li key={segment.start} className="border-t py-2">
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs tabular-nums">
                  <span className="font-medium">{timeRange(segment)} IST</span>
                  <span>{duration(milliseconds(segment))} {coverageLabels[segment.kind].toLowerCase()}</span>
                </div>
                {segment.review ? <div className="mt-1 text-xs text-muted-foreground">
                  {shiftIdleReasons.find(([value]) => value === segment.review?.reason)?.[1]}
                  {segment.review.note ? ` · ${segment.review.note}` : ""}
                </div> : null}
              </li>
            ))}
          </ul>
        </details>
      </TableCell>
    </TableRow>
  )
}

function MachineReason({ machine, review, onSaved, onSaving }: RowCallbacks & {
  machine: ShiftIdleMachine
  review: ShiftIdleReview
}) {
  const [editing, setEditing] = useState(false)
  const ranges = shiftReasonRanges(machine.segments)
  const saved = ranges.flatMap(({ review }) => review ? [review] : [])
  const first = saved[0]
  const consistent = first && saved.every(({ reason, note }) => reason === first.reason && note === first.note)
  const savedLabel = consistent ? shiftIdleReasons.find(([value]) => value === first.reason)?.[1] : undefined
  const canEdit = review.canEdit && !machine.untimedOutput

  if (!ranges.length) return null
  return (
    <div className="mt-2 grid gap-2">
      {first ? <p className="text-sm">{savedLabel ?? "Multiple reasons saved"}{consistent && first.note ? ` · ${first.note}` : ""}</p> : null}
      {canEdit && !editing ? <Button className="w-fit" size="sm" type="button" variant="outline" onClick={() => setEditing(true)}>
        {first ? "Edit reason" : "Add reason"}
      </Button> : null}
      {canEdit && editing ? (
        <MachineReasonForm machine={machine} review={review} onSaving={onSaving}
          onCancel={() => setEditing(false)} onSaved={(reviews) => {
            onSaved(reviews)
            setEditing(false)
          }} />
      ) : null}
    </div>
  )
}

export function MachineReasonForm({ machine, review, onSaved, onSaving, onCancel }: {
  machine: ShiftIdleMachine
  review: ShiftIdleReview
  onSaved: RowCallbacks["onSaved"]
  onSaving?: RowCallbacks["onSaving"]
  onCancel: () => void
}) {
  const ranges = shiftReasonRanges(machine.segments)
  const saved = ranges.flatMap(({ review }) => review ? [review] : [])
  const first = saved[0]
  const consistent = first && saved.every(({ reason, note }) => reason === first.reason && note === first.note)
  const [reason, setReason] = useState(consistent ? first.reason : "")
  const [note, setNote] = useState(consistent ? first.note ?? "" : "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [version] = useState(() => shiftReasonVersion(ranges))
  const hasPending = ranges.some(({ kind }) => kind === "gap")
  const changed = hasPending || !consistent || reason !== first.reason || note.trim() !== (first.note ?? "")

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!isShiftIdleReason(reason) || !changed || saving) return
    setSaving(true)
    onSaving?.(true)
    setError("")
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productionDate: review.productionDate, shift: review.shift, machineId: machine.machineId,
          reason, note, version,
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error)
      onSaved(result.reviews)
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not save reason.")
    } finally {
      setSaving(false)
      onSaving?.(false)
    }
  }

  return (
        <form className="flex flex-wrap items-center gap-2" onSubmit={save}>
          <p className="basis-full text-xs text-muted-foreground">
            One reason for {duration(ranges.reduce((total, segment) => total + milliseconds(segment), 0))} of unrecorded time this shift.
          </p>
          <NativeSelect aria-label={`Reason for ${machine.machineNumber}`} value={reason} disabled={saving}
            onChange={(event) => setReason(isShiftIdleReason(event.target.value) ? event.target.value : "")}>
            <NativeSelectOption value="">Select reason</NativeSelectOption>
            {shiftIdleReasons.map(([value, label]) => <NativeSelectOption key={value} value={value}>{label}</NativeSelectOption>)}
          </NativeSelect>
          <Input aria-label={`Note for ${machine.machineNumber}`} className="w-40" value={note}
            placeholder={reason === "other" ? "Note required" : "Optional note"} maxLength={500} disabled={saving}
            onChange={(event) => setNote(event.target.value)} />
          <Button size="sm" type="submit" disabled={saving || !changed || !reason || (reason === "other" && !note.trim())}>
            {saving ? "Saving…" : "Save reason"}
          </Button>
          <Button size="sm" type="button" variant="ghost" disabled={saving} onClick={onCancel}>Cancel</Button>
          {error ? <p role="alert" className="basis-full text-xs text-destructive">{error}</p> : null}
        </form>
  )
}
