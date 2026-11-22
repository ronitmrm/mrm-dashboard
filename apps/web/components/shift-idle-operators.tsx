"use client"

import { useEffect, useState } from "react"
import { X } from "lucide-react"
import type { ShiftIdleOperator, ShiftIdleOperatorCheck } from "@workspace/db"
import { StatusBadge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { CardContent, CardDescription, CardHeader, CardTitle, SectionCard } from "@workspace/ui/components/card"
import { SearchableSelect } from "@workspace/ui/components/searchable-select"
import { StandardState } from "@workspace/ui/components/standard-state"
import { OperationalTable, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@workspace/ui/components/table"
import { formatIstDate } from "@/lib/date-time"

const endpoint = "/api/shift-idle-operators"
type Page = { shifts: ShiftIdleOperatorCheck[]; canEdit: boolean }

const sameShift = (left: ShiftIdleOperatorCheck, right: ShiftIdleOperatorCheck) =>
  left.productionDate === right.productionDate && left.shift === right.shift

// End-of-shift task: record operators who came in but never got a machine,
// so attendance counts them even without a production session.
export function ShiftIdleOperatorsPanel({ workerOptions }: { workerOptions: readonly ShiftIdleOperator[] }) {
  const [page, setPage] = useState<Page | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    const controller = new AbortController()
    fetch(endpoint, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const data = await response.json()
        if (!response.ok) throw new Error(data.error)
        setPage(data)
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Try again.")
      })
    return () => controller.abort()
  }, [])

  const pending = page?.shifts.filter((shift) => !shift.checkedAt).length ?? 0
  return (
    <SectionCard>
      <CardHeader>
        <CardTitle>End of Shift: Operators Without a Machine</CardTitle>
        <CardDescription>
          After each shift, list operators who came to work but were not given a machine. Operators with a
          production session are already counted as present.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {error ? <StandardState variant="error" title="Could not load the end-of-shift task" description={error} /> : null}
        {!page && !error ? <StandardState variant="loading" title="Loading recent shifts" description="Checking the last few shifts." /> : null}
        {page && !page.shifts.length ? <StandardState title="No shifts have ended yet" description="This task appears after each shift ends." /> : null}
        {page?.shifts.length ? (
          <>
            <p className="text-sm" role="status">
              {pending ? `${pending} ${pending === 1 ? "shift needs" : "shifts need"} this task` : "All recent shifts are done"}
            </p>
            <OperationalTable aria-label="Operators without a machine" containerClassName="rounded-lg border">
              <TableHeader>
                <TableRow>
                  <TableHead>Production date</TableHead>
                  <TableHead>Shift</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="min-w-96">Operators without a machine</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {page.shifts.map((shift) => (
                  <ShiftRow key={`${shift.productionDate}-${shift.shift}`} shift={shift} canEdit={page.canEdit}
                    workerOptions={workerOptions}
                    onSaved={(saved) => setPage({ ...page, shifts: page.shifts.map((row) => sameShift(row, saved) ? saved : row) })} />
                ))}
              </TableBody>
            </OperationalTable>
          </>
        ) : null}
      </CardContent>
    </SectionCard>
  )
}

function ShiftRow({ shift, canEdit, workerOptions, onSaved }: {
  shift: ShiftIdleOperatorCheck
  canEdit: boolean
  workerOptions: readonly ShiftIdleOperator[]
  onSaved: (shift: ShiftIdleOperatorCheck) => void
}) {
  const [editing, setEditing] = useState(!shift.checkedAt)
  const [chosen, setChosen] = useState(shift.idle)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const key = (code: string) => code.toLowerCase()
  const taken = new Set([...shift.sessionOperators, ...chosen.map(({ code }) => code)].map(key))
  const available = workerOptions.filter(({ code }) => !taken.has(key(code)))

  async function save() {
    setSaving(true)
    setError("")
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productionDate: shift.productionDate, shift: shift.shift, employeeCodes: chosen.map(({ code }) => code) }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error)
      onSaved(result.shift)
      setChosen(result.shift.idle)
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
      <TableCell>{shift.shift}</TableCell>
      <TableCell>
        <StatusBadge tone={shift.checkedAt ? "positive" : "warning"} value={shift.checkedAt ? "Done" : "Pending"} />
      </TableCell>
      <TableCell className="whitespace-normal">
        {canEdit && editing ? (
          <div className="grid gap-2">
            {chosen.length ? (
              <ul className="flex flex-wrap gap-2">
                {chosen.map((operator) => (
                  <li key={operator.code}>
                    <Button type="button" size="sm" variant="outline" disabled={saving}
                      aria-label={`Remove ${operator.name}`}
                      onClick={() => setChosen(chosen.filter(({ code }) => code !== operator.code))}>
                      {operator.name} · {operator.code}
                      <X className="size-3" />
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <SearchableSelect aria-label={`Add operator for shift ${shift.shift}`} className="w-64" size="sm" value=""
                disabled={saving || !available.length} searchPlaceholder="Type a name or code"
                onValueChange={(code) => {
                  const operator = available.find((option) => option.code === code)
                  if (operator) setChosen([...chosen, operator])
                }}>
                <option value="">Add operator</option>
                {available.map((option) => <option key={option.code} value={option.code}>{option.name} · {option.code}</option>)}
              </SearchableSelect>
              <Button type="button" size="sm" disabled={saving} onClick={save}>
                {saving ? "Saving…" : chosen.length ? `Save ${chosen.length} ${chosen.length === 1 ? "operator" : "operators"}` : "Nobody was without a machine"}
              </Button>
              {shift.checkedAt ? (
                <Button type="button" size="sm" variant="ghost" disabled={saving}
                  onClick={() => { setChosen(shift.idle); setEditing(false) }}>Cancel</Button>
              ) : null}
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
