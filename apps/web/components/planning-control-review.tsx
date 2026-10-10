"use client"

import { useState, type FormEvent } from "react"
import Link from "next/link"
import { CheckCircle2 } from "lucide-react"
import { productionSessionEfficiency } from "@workspace/db/production-session-domain"
import type { ProductionFloorCode } from "@workspace/db/production-floors"
import { StatusBadge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  SectionCard,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Label } from "@workspace/ui/components/label"
import { StandardState } from "@workspace/ui/components/standard-state"
import {
  OperationalTable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { Textarea } from "@workspace/ui/components/textarea"
import { useConditionalRecords } from "@/hooks/use-conditional-records"
import { formatIstDate } from "@/lib/date-time"

type Session = Record<string, unknown>
type Workflow = Record<string, unknown>
const workflowKey = (row: Workflow) =>
  [row.machine, row.jcNo, row.partCode, row.optionNumber, row.setupNo].join("|")
const quantity = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 })
const percentage = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 })

export function PlanningControlReview({
  floor,
  workflowRows,
  onClose,
  onResolve,
}: {
  floor: ProductionFloorCode
  workflowRows: Workflow[]
  onClose: (session: Session, comment: string) => Promise<void>
  onResolve: (row: Workflow) => Promise<void>
}) {
  const delivery = useConditionalRecords(
    `/api/production-sessions?floor=${encodeURIComponent(floor)}&efficiencyFlagsOnly=1&limit=500&conditional=1`,
    undefined,
    undefined,
    true
  )
  const [comments, setComments] = useState<Record<string, string>>({})
  const [closedIds, setClosedIds] = useState<string[]>([])
  const [resolvedKeys, setResolvedKeys] = useState<string[]>([])
  const [savingId, setSavingId] = useState("")
  const [error, setError] = useState("")
  const sessions = Array.isArray(delivery.data?.rows)
    ? (delivery.data.rows as Session[]).filter(
        (session) => !closedIds.includes(String(session.id))
      )
    : []
  const workflows = workflowRows.filter((row) => !resolvedKeys.includes(workflowKey(row)))

  async function closeFlag(
    event: FormEvent<HTMLFormElement>,
    session: Session
  ) {
    event.preventDefault()
    const id = String(session.id)
    const comment = (comments[id] ?? "").trim()
    if (!comment || savingId) return
    setSavingId(`session:${id}`)
    setError("")
    try {
      await onClose(session, comment)
      setClosedIds((current) => [...current, id])
      setComments((current) => {
        const next = { ...current }
        delete next[id]
        return next
      })
      delivery.refresh()
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not close the efficiency flag."
      )
      delivery.refresh()
    } finally {
      setSavingId("")
    }
  }

  async function resolveWorkflow(row: Workflow) {
    if (savingId) return
    const key = workflowKey(row)
    setSavingId(`workflow:${key}`)
    setError("")
    try {
      await onResolve(row)
      setResolvedKeys((current) => [...current, key])
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not resolve the workflow exception.")
    } finally {
      setSavingId("")
    }
  }

  return (
    <SectionCard>
      <CardHeader>
        <CardTitle>Planning Review</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        {delivery.loading ? (
          <StandardState
            variant="loading"
            title="Loading efficiency flags"
            description="Checking completed sessions in this Production Unit."
          />
        ) : null}
        {delivery.error || error ? (
          <StandardState
            variant="error"
            title="Could not complete the action"
            description={error || delivery.error || ""}
            action={
              <Button variant="outline" onClick={delivery.refresh}>
                Refresh sessions
              </Button>
            }
          />
        ) : null}
        {!delivery.loading && !delivery.error && !sessions.length && !workflows.length ? (
          <StandardState
            title="No open planning reviews"
            description="No session flags or workflow exceptions need review."
          />
        ) : null}
        {sessions.length || workflows.length ? (
          <OperationalTable
            filterStorageKey={`planning-control-review-${floor}`}
            containerClassName="max-h-[70vh] rounded-lg border"
          >
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Session / Date</TableHead>
                <TableHead>Machine</TableHead>
                <TableHead>Job Card / Part / Setup</TableHead>
                <TableHead>Operator / Shift</TableHead>
                <TableHead className="text-right">Produced</TableHead>
                <TableHead className="text-right">Target</TableHead>
                <TableHead className="text-right">Efficiency</TableHead>
                <TableHead className="min-w-72">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.map((session) => {
                const id = String(session.id)
                const reference = String(session.sessionReference ?? id)
                const efficiency = productionSessionEfficiency({
                  totalPieces: Number(session.totalPieces),
                  targetPieces: Number(session.targetPieces),
                })
                return (
                  <TableRow key={`session:${id}`} data-row-id={`session:${id}`}>
                    <TableCell><StatusBadge tone="warning" value="Session flag" /></TableCell>
                    <TableCell>
                      <Link
                        className="font-mono text-xs underline underline-offset-4"
                        href={`/dashboard/production-sessions?floor=${encodeURIComponent(floor)}&session=${encodeURIComponent(id)}`}
                      >
                        {reference}
                      </Link>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {formatIstDate(String(session.productionDate))}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">
                      {String(session.machineNumber)}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">
                        {String(session.jobCardNumber)}
                      </div>
                      <div>{String(session.partCode)}</div>
                      <div className="text-xs text-muted-foreground">
                        Option {String(session.optionNumber)} · Setup{" "}
                        {String(session.setupNumber)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>{String(session.operatorCode)}</div>
                      <div className="text-xs text-muted-foreground">
                        {String(session.operatorName)}
                      </div>
                      <div className="text-xs">
                        Shift {String(session.shift)}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {quantity.format(Number(session.totalPieces))}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {quantity.format(Number(session.targetPieces))}
                    </TableCell>
                    <TableCell className="text-right">
                      <StatusBadge
                        tone="warning"
                        value={
                          efficiency === null
                            ? "Unavailable"
                            : `${percentage.format(efficiency * 100)}%`
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <form
                        className="grid gap-2"
                        onSubmit={(event) => void closeFlag(event, session)}
                      >
                        <Label
                          className="sr-only"
                          htmlFor={`efficiency-comment-${id}`}
                        >
                          Closure comment for {reference}
                        </Label>
                        <Textarea
                          id={`efficiency-comment-${id}`}
                          required
                          rows={2}
                          value={comments[id] ?? ""}
                          placeholder="Review / action taken"
                          disabled={Boolean(savingId)}
                          onChange={(event) =>
                            setComments((current) => ({
                              ...current,
                              [id]: event.target.value,
                            }))
                          }
                        />
                        <Button
                          type="submit"
                          variant="outline"
                          className="w-fit"
                          disabled={
                            Boolean(savingId) || !(comments[id] ?? "").trim()
                          }
                        >
                          {savingId === `session:${id}` ? "Closing…" : "Close flag"}
                        </Button>
                      </form>
                    </TableCell>
                  </TableRow>
                )
              })}
              {workflows.map((row) => {
                const key = workflowKey(row)
                return (
                  <TableRow key={`workflow:${key}`} data-row-id={`workflow:${key}`}>
                    <TableCell><StatusBadge tone="warning" value="Workflow exception" /></TableCell>
                    <TableCell>—</TableCell>
                    <TableCell className="font-medium">{String(row.machine ?? "—")}</TableCell>
                    <TableCell>
                      <div className="font-medium">{String(row.jcNo ?? "—")}</div>
                      <div>{String(row.partCode ?? "—")}</div>
                      <div className="text-xs text-muted-foreground">
                        Option {String(row.optionNumber ?? "—")} · Setup {String(row.setupNo ?? "—")}
                      </div>
                      <div className="text-xs text-muted-foreground">{String(row.setupName ?? "")}</div>
                    </TableCell>
                    <TableCell>{String(row.shopFloorWorker || "—")}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      <div>{quantity.format(Number(row.rawRows))} production rows</div>
                      <div className="text-xs text-muted-foreground">
                        Output {quantity.format(Number(row.rawOutputQty))} / Actual {quantity.format(Number(row.rawActualQty))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">—</TableCell>
                    <TableCell className="text-right">—</TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={Boolean(savingId)}
                        onClick={() => void resolveWorkflow(row)}
                      >
                        <CheckCircle2 className="size-4" />
                        {savingId === `workflow:${key}` ? "Resolving…" : "Resolve workflow"}
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </OperationalTable>
        ) : null}
      </CardContent>
    </SectionCard>
  )
}
