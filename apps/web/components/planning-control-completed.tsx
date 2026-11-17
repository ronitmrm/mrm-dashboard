"use client"

import { useState } from "react"
import Link from "next/link"
import type { createPlanningControlHistoryRepository } from "@workspace/db"
import type { ProductionFloorCode } from "@workspace/db/production-floors"
import { shiftIdleReasons, type ShiftIdleMachine, type ShiftIdleReview } from "@workspace/db/shift-idle-reasons"
import { Button } from "@workspace/ui/components/button"
import { StandardState } from "@workspace/ui/components/standard-state"
import { OperationalTable, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@workspace/ui/components/table"
import { useConditionalRecords } from "@/hooks/use-conditional-records"
import { formatIstDate, formatIstDateTime } from "@/lib/date-time"
import { MachineReasonForm } from "./shift-idle-review"
import { PlanningRecordCells, PlanningRecordHeaders } from "./planning-record-columns"

type HistoryRow = Awaited<ReturnType<ReturnType<typeof createPlanningControlHistoryRepository>["read"]>>["rows"][number]
const labels: Record<HistoryRow["kind"], string> = {
  session: "Session flag closed",
  material: "Short material accepted",
  workflow: "Workflow resolved",
  setup: "Setup reopened",
  rework: "Rework route selected",
  dispatch: "Dispatched",
  machine: "Machine reason saved",
}

export function PlanningControlCompleted({ floor }: { floor: ProductionFloorCode }) {
  const [page, setPage] = useState(0)
  const [notice, setNotice] = useState("")
  const history = useConditionalRecords(`/api/planning-control-history?floor=${floor}&page=${page}`)
  const rows = (history.data?.rows ?? []) as HistoryRow[]
  if (history.loading) return <StandardState variant="loading" title="Loading completed reviews" description="Reading saved planning records." />
  if (history.error) return <StandardState variant="error" title="Could not load completed reviews" description={history.error}
    action={<Button type="button" onClick={history.refresh}>Try again</Button>} />

  return (
    <>
      <p role="status" className={notice ? "text-sm text-muted-foreground" : "sr-only"}>{notice}</p>
      {rows.length ? (
        <OperationalTable aria-label="Completed planning reviews" containerClassName="rounded-lg border">
          <TableHeader><TableRow>
            <PlanningRecordHeaders /><TableHead>Completed</TableHead><TableHead>Outcome</TableHead><TableHead>Action</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {rows.map((row) => {
              const machineReview = row.kind === "machine"
              const href = row.sessionId
                  ? `/dashboard/production-sessions?floor=${floor}&session=${encodeURIComponent(row.sessionId)}`
                  : `/dashboard/job-cards/${encodeURIComponent(row.jobCard ?? "")}?floor=${floor}`
              return (
                <TableRow key={row.id}>
                  <PlanningRecordCells floor={floor} machine={row.machine} part={row.part} setup={row.setup} job={row.jobCard} />
                  <TableCell>
                    {formatIstDateTime(row.completedAt)}
                    {machineReview ? <div className="text-xs text-muted-foreground">
                      {formatIstDate(row.productionDate ?? "")} · Shift {row.shift}
                    </div> : null}
                  </TableCell>
                  <TableCell className="min-w-48 whitespace-normal">
                    <div>{labels[row.kind]}</div>
                    <div className="text-xs text-muted-foreground">
                      {machineReview ? shiftIdleReasons.find(([value]) => value === row.reason)?.[1] ?? "Multiple reasons" : row.reason}
                      {row.note ? ` · ${row.note}` : ""}
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    {machineReview ? (history.data?.canEditMachineReasons === true ? (
                      <CompletedMachineReason row={row} onSaved={() => {
                        setNotice(`Reason saved for ${row.machine}.`)
                        history.refresh()
                      }} />
                    ) : null) : <Button size="sm" variant="outline" asChild><Link href={href}>Open record</Link></Button>}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </OperationalTable>
      ) : <StandardState title="No completed reviews" description="Saved reviews and completed planning work appear here." />}
      {page > 0 || history.data?.hasNext === true ? (
        <div className="flex items-center justify-end gap-2">
          <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button>
          <span className="text-sm text-muted-foreground">Page {page + 1}</span>
          <Button size="sm" variant="outline" disabled={history.data?.hasNext !== true} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      ) : null}
    </>
  )
}

function CompletedMachineReason({ row, onSaved }: { row: HistoryRow; onSaved: () => void }) {
  const [editor, setEditor] = useState<{ machine: ShiftIdleMachine; review: ShiftIdleReview } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  async function openEditor() {
    setLoading(true)
    setError("")
    try {
      const params = new URLSearchParams({ date: row.productionDate ?? "", shift: row.shift ?? "" })
      const response = await fetch(`/api/shift-idle-review?${params}`, { cache: "no-store" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? "Could not load the reason.")
      const review: ShiftIdleReview = data
      const machine = review.machines.find((machine) => machine.machineNumber === row.machine)
      if (!review.canEdit) throw new Error("You do not have permission to edit this reason.")
      if (!machine || machine.untimedOutput || !machine.segments.some((segment) => segment.review))
        throw new Error("The shift records changed. Check the machine in Machine Review.")
      setEditor({ machine, review })
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not load the reason.")
    } finally {
      setLoading(false)
    }
  }

  if (editor) return (
    <div className="min-w-52">
      <MachineReasonForm {...editor} onCancel={() => setEditor(null)} onSaved={() => {
        setEditor(null)
        onSaved()
      }} />
    </div>
  )
  return (
    <>
      <Button size="sm" type="button" variant="outline" disabled={loading} onClick={() => void openEditor()}>
        {loading ? "Loading…" : "Edit reason"}
      </Button>
      {error ? <p role="alert" className="mt-1 text-xs text-destructive">{error}</p> : null}
    </>
  )
}
