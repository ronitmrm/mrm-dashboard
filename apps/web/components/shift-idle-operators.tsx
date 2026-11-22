"use client"

import { useEffect, useState } from "react"
import type { ShiftIdleOperator, ShiftIdleOperatorCheck } from "@workspace/db"
import type { ProductionFloorCode } from "@workspace/db/production-floors"
import { StatusBadge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Field, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { SearchableSelect } from "@workspace/ui/components/searchable-select"
import { StandardState } from "@workspace/ui/components/standard-state"
import { OperationalTable, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@workspace/ui/components/table"
import { formatIstDate, formatIstDateTime } from "@/lib/date-time"
import { shiftLabel } from "@/lib/dashboard-units"

const endpoint = "/api/shift-idle-operators"
type Page = { shifts: ShiftIdleOperatorCheck[]; canEdit: boolean }
export type ShiftIdleOperators = ReturnType<typeof useShiftIdleOperators>

const sameShift = (left: ShiftIdleOperatorCheck, right: ShiftIdleOperatorCheck) =>
  left.productionDate === right.productionDate && left.shift === right.shift

// End-of-shift task: operators who came in but never got a machine, so
// attendance counts them even without a production session.
export function useShiftIdleOperators(enabled: boolean, floor: ProductionFloorCode) {
  const [page, setPage] = useState<Page | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    fetch(`${endpoint}?floor=${encodeURIComponent(floor)}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const data = await response.json()
        if (!response.ok) throw new Error(data.error)
        setPage(data)
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Try again.")
      })
    return () => controller.abort()
  }, [enabled, floor])

  return {
    page,
    error,
    pendingCount: page?.shifts.filter((shift) => !shift.checkedAt).length ?? null,
    replace: (saved: ShiftIdleOperatorCheck) =>
      setPage((current) => current && { ...current, shifts: current.shifts.map((row) => sameShift(row, saved) ? saved : row) }),
  }
}

export function ShiftIdleOperatorsQueue({ data, view, workerOptions }: {
  data: ShiftIdleOperators
  view: "pending" | "completed"
  workerOptions: readonly ShiftIdleOperator[]
}) {
  const { page, error, replace } = data
  const completed = view === "completed"
  const rows = page?.shifts.filter((shift) => Boolean(shift.checkedAt) === completed) ?? []
  if (error) return <StandardState variant="error" title="Could not load the end-of-shift task" description={error} />
  if (!page) return <StandardState variant="loading" title="Loading recent shifts" description="Checking the last few shifts." />
  if (!rows.length) return completed
    ? <StandardState title="Nothing completed yet" description="Shifts appear here once their operators are saved." />
    : <StandardState title="No shifts are waiting" description="After each shift ends, list the operators who had no machine here." />
  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">
        {completed
          ? "Saved shifts from the last 7 days. Use Edit to correct a mistake."
          : "List operators who came to work but were not given a machine. Operators with a production session are already counted as present."}
      </p>
      <OperationalTable aria-label={completed ? "Completed end-of-shift entries" : "Operators without a machine"} containerClassName="rounded-lg border">
        <TableHeader>
          <TableRow>
            <TableHead>Production date</TableHead>
            <TableHead>Shift</TableHead>
            <TableHead>{completed ? "Completed" : "Status"}</TableHead>
            <TableHead className="min-w-96">Operators without a machine</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((shift) => (
            <ShiftRow key={`${shift.productionDate}-${shift.shift}`} shift={shift} canEdit={page.canEdit}
              workerOptions={workerOptions} onSaved={replace} />
          ))}
        </TableBody>
      </OperationalTable>
    </div>
  )
}

function ShiftRow({ shift, canEdit, workerOptions, onSaved }: {
  shift: ShiftIdleOperatorCheck
  canEdit: boolean
  workerOptions: readonly ShiftIdleOperator[]
  onSaved: (shift: ShiftIdleOperatorCheck) => void
}) {
  const [editing, setEditing] = useState(!shift.checkedAt)
  // One slot per operator; picking a code fills the name and vice versa.
  const [slots, setSlots] = useState<(ShiftIdleOperator | null)[]>(shift.idle)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const key = (code: string) => code.toLowerCase()
  const inSession = new Set(shift.sessionOperators.map(key))
  const filled = slots.filter((slot) => slot !== null)
  const complete = filled.length === slots.length

  function resize(count: number) {
    setSlots(Array.from({ length: count }, (_, index) => slots[index] ?? null))
  }

  function choose(index: number, code: string) {
    const operator = workerOptions.find((option) => option.code === code) ?? null
    setSlots(slots.map((slot, current) => current === index ? operator : slot))
  }

  // Everyone not already in a session or picked in another slot.
  function optionsFor(index: number) {
    const taken = new Set(slots.flatMap((slot, current) => slot && current !== index ? [key(slot.code)] : []))
    return workerOptions.filter(({ code }) => !inSession.has(key(code)) && !taken.has(key(code)))
  }

  async function save() {
    if (!complete) return
    setSaving(true)
    setError("")
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productionFloorCode: shift.productionFloorCode,
          productionDate: shift.productionDate,
          shift: shift.shift,
          employeeCodes: filled.map(({ code }) => code),
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error)
      onSaved(result.shift)
      setSlots(result.shift.idle)
      setEditing(false)
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not save. Try again.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <TableRow>
      <TableCell>{formatIstDate(shift.productionDate)}</TableCell>
      <TableCell>{shiftLabel(shift.shift)}</TableCell>
      <TableCell>
        {shift.checkedAt ? formatIstDateTime(shift.checkedAt) : <StatusBadge tone="warning" value="Pending" />}
      </TableCell>
      <TableCell className="whitespace-normal">
        {canEdit && editing ? (
          <div className="grid gap-3">
            <Field className="w-56">
              <FieldLabel htmlFor={`idle-count-${shift.productionDate}-${shift.shift}`}>How many operators had no machine?</FieldLabel>
              <Input id={`idle-count-${shift.productionDate}-${shift.shift}`} type="number" inputMode="numeric" min={0} max={50}
                value={slots.length} disabled={saving}
                onChange={(event) => resize(Math.min(50, Math.max(0, Math.trunc(Number(event.target.value) || 0))))} />
            </Field>
            {slots.map((slot, index) => {
              const options = optionsFor(index)
              return (
                <div key={index} className="flex flex-wrap items-center gap-2">
                  <span className="w-6 text-sm text-muted-foreground">{index + 1}.</span>
                  <SearchableSelect aria-label={`Operator ${index + 1} code`} className="w-40" size="sm"
                    value={slot?.code ?? ""} disabled={saving} searchPlaceholder="Type a code"
                    onValueChange={(code) => choose(index, code)}>
                    <option value="">Select code</option>
                    {[...options].sort((left, right) => left.code.localeCompare(right.code, "en-IN", { numeric: true }))
                      .map((option) => <option key={option.code} value={option.code}>{option.code}</option>)}
                  </SearchableSelect>
                  <SearchableSelect aria-label={`Operator ${index + 1} name`} className="w-64" size="sm"
                    value={slot?.code ?? ""} disabled={saving} searchPlaceholder="Type a name"
                    onValueChange={(code) => choose(index, code)}>
                    <option value="">Select name</option>
                    {options.map((option) => <option key={option.code} value={option.code}>{option.name}</option>)}
                  </SearchableSelect>
                </div>
              )
            })}
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" disabled={saving || !complete} onClick={save}>
                {saving ? "Saving…" : slots.length ? `Save ${slots.length} ${slots.length === 1 ? "operator" : "operators"}` : "Save: nobody was without a machine"}
              </Button>
              {shift.checkedAt ? (
                <Button type="button" size="sm" variant="ghost" disabled={saving}
                  onClick={() => { setSlots(shift.idle); setEditing(false) }}>Cancel</Button>
              ) : null}
              {!complete ? <span className="text-xs text-muted-foreground">Select every operator to save.</span> : null}
            </div>
            {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm">
              {shift.checkedAt
                ? shift.idle.map(({ name }) => name).join(", ") || "Nobody was without a machine"
                : "Not filled yet"}
            </span>
            {canEdit ? <Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)}>Edit</Button> : null}
          </div>
        )}
      </TableCell>
    </TableRow>
  )
}
