"use client"

import { useState, type FormEvent } from "react"
import Link from "next/link"
import { productionSessionEfficiency } from "@workspace/db/production-session-domain"
import type { ProductionFloorCode } from "@workspace/db/production-floors"
import { StatusBadge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  SectionCard,
  CardContent,
  CardDescription,
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
const quantity = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 })
const percentage = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 })

export function ProductionSessionEfficiencyFlags({
  floor,
  onClose,
}: {
  floor: ProductionFloorCode
  onClose: (session: Session, comment: string) => Promise<void>
}) {
  const delivery = useConditionalRecords(
    `/api/production-sessions?floor=${encodeURIComponent(floor)}&efficiencyFlagsOnly=1&limit=500&conditional=1`,
    undefined,
    undefined,
    true
  )
  const [comments, setComments] = useState<Record<string, string>>({})
  const [closedIds, setClosedIds] = useState<string[]>([])
  const [savingId, setSavingId] = useState("")
  const [error, setError] = useState("")
  const sessions = Array.isArray(delivery.data?.rows)
    ? (delivery.data.rows as Session[]).filter(
        (session) => !closedIds.includes(String(session.id))
      )
    : []

  async function closeFlag(
    event: FormEvent<HTMLFormElement>,
    session: Session
  ) {
    event.preventDefault()
    const id = String(session.id)
    const comment = (comments[id] ?? "").trim()
    if (!comment || savingId) return
    setSavingId(id)
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

  return (
    <SectionCard>
      <CardHeader>
        <CardTitle>Session Efficiency Flags</CardTitle>
        <CardDescription>
          Closed sessions above 100% efficiency. Production and planning
          continue. Review the session, make any needed correction, then add a
          comment to close the flag. Comments remain in the session timeline.
        </CardDescription>
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
                Refresh flags
              </Button>
            }
          />
        ) : null}
        {!delivery.loading && !delivery.error && !sessions.length ? (
          <StandardState
            title="No open efficiency flags"
            description="All completed sessions above 100% have been reviewed, or none need review."
          />
        ) : null}
        {sessions.length ? (
          <OperationalTable
            filterStorageKey={`planning-control-efficiency-flags-${floor}`}
            containerClassName="max-h-[70vh] rounded-lg border"
            toolbarStart={
              <span className="text-sm text-muted-foreground">
                {quantity.format(sessions.length)} open flags · Full session
                history
              </span>
            }
          >
            <TableHeader>
              <TableRow>
                <TableHead>Session / Date</TableHead>
                <TableHead>Machine</TableHead>
                <TableHead>Job Card / Part / Setup</TableHead>
                <TableHead>Operator / Shift</TableHead>
                <TableHead className="text-right">Produced</TableHead>
                <TableHead className="text-right">Target</TableHead>
                <TableHead className="text-right">Efficiency</TableHead>
                <TableHead className="min-w-72">Close Flag</TableHead>
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
                  <TableRow key={id} data-row-id={id}>
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
                          {savingId === id ? "Closing…" : "Close flag"}
                        </Button>
                      </form>
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
