"use client"

import { formatCalendarDate, isIsoCalendarDate } from "@workspace/ui/lib/calendar-date"

import { useState, type FormEvent, type ReactNode } from "react"
import Link from "next/link"
import { CheckCircle2, RefreshCw } from "lucide-react"
import type { createProductionShopFloorRepository } from "@workspace/db"
import { productionSessionEfficiency } from "@workspace/db/production-session-domain"
import type { ProductionFloorCode } from "@workspace/db/production-floors"
import { StatusBadge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { SectionCard, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { Dialog } from "@workspace/ui/components/dialog"
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { StandardState } from "@workspace/ui/components/standard-state"
import { OperationalTable, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@workspace/ui/components/table"
import { Textarea } from "@workspace/ui/components/textarea"
import { StandardDialogContent } from "@/components/ui/golden-patterns"
import { ShiftIdleReviewPanel } from "./shift-idle-review"
import { PlanningControlCompleted } from "./planning-control-completed"
import { PlanningRecordCells, PlanningRecordHeaders } from "./planning-record-columns"
import { useConditionalRecords } from "@/hooks/use-conditional-records"
import { formatIstDate, istDateValue } from "@/lib/date-time"

type Session = Record<string, unknown>
type Workflow = Record<string, unknown>
type Material = Awaited<ReturnType<ReturnType<typeof createProductionShopFloorRepository>["readRawMaterialReviews"]>>["rows"][number]
type MaterialFlowReview = Awaited<ReturnType<ReturnType<typeof createProductionShopFloorRepository>["readRawMaterialReviews"]>>["materialFlowReviews"][number]
const workflowKey = (row: Workflow) =>
  [row.machine, row.jcNo, row.partCode, row.optionNumber, row.setupNo].join("|")
const quantity = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 })
const percentage = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 })
const weight = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 3 })
const kg = (value: number | null) => value === null ? "Blank weight required" : `${weight.format(value)} kg`
const queues = [
  ["production", "Production"],
  ["material", "Material"],
  ["dispatch", "Dispatch"],
  ["shift-coverage", "Machine Review"],
  ["completed", "Completed"],
] as const
type Queue = (typeof queues)[number][0]

function ReviewRow({ id, floor, job, part, machine, setup, summary, details, action }: {
  id: string
  floor: ProductionFloorCode
  job: unknown
  part: unknown
  machine?: unknown
  setup?: unknown
  summary: ReactNode
  details?: ReactNode
  action: ReactNode
}) {
  return (
    <TableRow data-row-id={id}>
      <PlanningRecordCells floor={floor} machine={machine} part={part} setup={setup} job={job} />
      <TableCell className="w-full min-w-52 whitespace-normal align-top">
        <div className="grid justify-items-start gap-1">{summary}</div>
        {details ? (
          <details className="mt-1 text-xs text-muted-foreground">
            <summary className="w-fit cursor-pointer">Details</summary>
            <div className="mt-1 grid gap-1">{details}</div>
          </details>
        ) : null}
      </TableCell>
      <TableCell className="min-w-40 whitespace-normal align-top">{action}</TableCell>
    </TableRow>
  )
}

export function PlanningControlReview({ floor, workflowRows, reworkRows = [], dispatchRows = [], defaultQueue, machineReview, onClose, onResolve, onAcceptMaterial }: {
  floor: ProductionFloorCode
  workflowRows: Workflow[]
  reworkRows?: Workflow[]
  dispatchRows?: Workflow[]
  defaultQueue?: string | null
  machineReview?: { date: string; shift: string; machine: string }
  onClose: (session: Session, comment: string) => Promise<void>
  onResolve: (row: Workflow) => Promise<void>
  onAcceptMaterial: (row: Material, reason: string) => Promise<unknown>
}) {
  const delivery = useConditionalRecords(
    `/api/production-sessions?floor=${encodeURIComponent(floor)}&efficiencyFlagsOnly=1&limit=500&conditional=1`,
    undefined, undefined, true
  )
  const materialDelivery = useConditionalRecords(`/api/raw-material-review?floor=${encodeURIComponent(floor)}`)
  const availableQueues = queues.filter(([key]) => key !== "shift-coverage" || floor === "cnc")
  const [queue, setQueue] = useState<Queue>(() => availableQueues.find(([key]) => key === defaultQueue)?.[0] ?? "production")
  const [comments, setComments] = useState<Record<string, string>>({})
  const [closedIds, setClosedIds] = useState<string[]>([])
  const [resolvedKeys, setResolvedKeys] = useState<string[]>([])
  const [savingId, setSavingId] = useState("")
  const [error, setError] = useState("")
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null)
  const [acceptedMaterialKeys, setAcceptedMaterialKeys] = useState<string[]>([])
  const [materialReason, setMaterialReason] = useState("")
  const [materialError, setMaterialError] = useState("")
  const sessions = Array.isArray(delivery.data?.rows)
    ? (delivery.data.rows as Session[]).filter(session => !closedIds.includes(String(session.id)))
    : []
  const materials = ((materialDelivery.data?.rows ?? []) as Material[]).filter((row) =>
    !row.shortAccepted && !acceptedMaterialKeys.includes(`${row.id}:${row.rowVersion}`))
  const materialFlowReviews = (materialDelivery.data?.materialFlowReviews ?? []) as MaterialFlowReview[]
  const workflows = workflowRows.filter(row => !resolvedKeys.includes(workflowKey(row)))
  const commitments = dispatchRows.filter(row => typeof row.committedDispatchDate === "string"
    && isIsoCalendarDate(row.committedDispatchDate) && row.status !== "Dispatched")
    .sort((left, right) => String(left.committedDispatchDate).localeCompare(String(right.committedDispatchDate)))
  const today = istDateValue()
  const counts = {
    production: sessions.length + workflows.length,
    material: materials.length + materialFlowReviews.length + reworkRows.length,
    dispatch: commitments.length,
    "shift-coverage": null,
    completed: null,
  }
  const loading = queue === "production" ? delivery.loading : queue === "material" && materialDelivery.loading
  const loadError = queue === "production" ? delivery.error : queue === "material" ? materialDelivery.error : ""

  function refresh() {
    delivery.refresh()
    materialDelivery.refresh()
  }

  async function closeFlag(event: FormEvent<HTMLFormElement>, session: Session) {
    event.preventDefault()
    const id = String(session.id)
    const comment = (comments[id] ?? "").trim()
    if (!comment || savingId) return
    setSavingId(`session:${id}`)
    setError("")
    try {
      await onClose(session, comment)
      setClosedIds(current => [...current, id])
      setComments(current => {
        const next = { ...current }
        delete next[id]
        return next
      })
      delivery.refresh()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not close the efficiency flag.")
      delivery.refresh()
    } finally { setSavingId("") }
  }

  async function resolveWorkflow(row: Workflow) {
    if (savingId) return
    const key = workflowKey(row)
    setSavingId(`workflow:${key}`)
    setError("")
    try {
      await onResolve(row)
      setResolvedKeys(current => [...current, key])
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not resolve the workflow exception.")
    } finally { setSavingId("") }
  }

  async function acceptMaterial(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedMaterial || !materialReason.trim() || savingId) return
    setSavingId(`rm:${selectedMaterial.id}`)
    setMaterialError("")
    try {
      await onAcceptMaterial(selectedMaterial, materialReason.trim())
      setAcceptedMaterialKeys((keys) => [...keys, `${selectedMaterial.id}:${selectedMaterial.rowVersion}`])
      setSelectedMaterial(null)
      setMaterialReason("")
      materialDelivery.refresh()
    } catch (failure) {
      setMaterialError(failure instanceof Error ? failure.message : "Could not accept short RM.")
      materialDelivery.refresh()
    } finally { setSavingId("") }
  }

  return (
    <SectionCard className="min-w-0">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle>Planning review</CardTitle>
        {queue !== "shift-coverage" && queue !== "completed" ? <Button type="button" size="sm" variant="outline" onClick={refresh} disabled={loading}>
          <RefreshCw /> Refresh
        </Button> : null}
      </CardHeader>
      <CardContent className="min-w-0">
          <nav className="flex gap-1 overflow-x-auto rounded-lg border bg-muted/30 p-1" aria-label="Planning review queues">
              {availableQueues.map(([key, label]) => (
                <Button className="shrink-0" key={key} type="button" size="sm"
                  variant={queue === key ? "default" : "ghost"} aria-pressed={queue === key}
                  onClick={() => { setQueue(key); setError("") }}>
                  {label}{counts[key] === null ? null : <span className="text-xs tabular-nums opacity-80">{counts[key]}</span>}
                </Button>
              ))}
          </nav>
          <section aria-label={availableQueues.find(([key]) => key === queue)?.[1]} className="grid min-w-0 gap-3 pt-4">
            {queue === "shift-coverage" ? <ShiftIdleReviewPanel initialReview={machineReview} /> : null}
            {queue === "completed" ? <PlanningControlCompleted floor={floor} /> : null}
            {loading ? <StandardState variant="loading" title="Loading reviews" description="Checking the selected queue." /> : null}
            {loadError || error ? <StandardState variant="error" title="Could not complete the review" description={error || loadError || ""}
              action={<Button variant="outline" onClick={refresh}>Refresh</Button>} /> : null}
            {!loading && !loadError && counts[queue] === 0 ? (
              <StandardState title="Nothing to review" description="There are no entries in this queue." />
            ) : null}
            {counts[queue] ? (
              <OperationalTable key={queue} filterStorageKey={`planning-control-flags-${floor}-${queue}`} containerClassName="max-h-[70vh] rounded-lg border">
                <TableHeader><TableRow>
                  <PlanningRecordHeaders />
                  <TableHead>{queue === "dispatch" ? "Dispatch commitment" : "What needs review"}</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {queue === "dispatch" ? commitments.map(row => {
                    const date = String(row.committedDispatchDate)
                    const status = date < today ? "Overdue" : date === today ? "Due today" : "Upcoming"
                    const id = `dispatch:${String(row.jcNo)}`
                    return <ReviewRow key={id} id={id} floor={floor} job={row.jcNo} part={row.partCode}
                      summary={<>
                        <StatusBadge value={status} tone={status === "Overdue" ? "danger" : status === "Due today" ? "warning" : "information"} />
                        <div>Committed {formatCalendarDate(date)} · Expected {formatCalendarDate(row.currentProbableDispatchDate)}</div>
                      </>}
                      details={<>
                        <div>FG PO {String(row.fgPoNo || "—")}</div>
                        <div>{String(row.status)} · Dispatched {row.dispatchedPieces == null ? "—" : `${quantity.format(Number(row.dispatchedPieces))} pcs`}</div>
                      </>}
                      action={<Button size="sm" variant="outline" asChild><Link href={`/?tab=productionControlTab&floor=${floor}`}>Planner Actions</Link></Button>} />
                  }) : null}
                  {queue === "material" ? <>
                    {materialFlowReviews.map(row => {
                      const id = `material-flow:${row.id}`
                      return <ReviewRow key={id} id={id} floor={floor} job={row.jobCardNumber} part={row.partCode} machine={row.machineNumber} setup={row.setupNumber}
                        summary={<><StatusBadge tone="warning" value="Material flow conflict" />
                          <div>Setup released awaiting material</div></>}
                        details={<>
                          <div>Option {row.optionNumber} · Upstream Setup {row.upstreamSetupNumber} is Item Complete</div>
                          <div>Upstream good {quantity.format(row.upstreamGoodPieces)} · Setup processed {quantity.format(row.setupProcessedPieces)}</div>
                          <div>Review counts and reopen the upstream setup if work remains.</div>
                        </>}
                        action={<div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="outline" asChild><Link href={`/dashboard/production-sessions?floor=${floor}${row.sessionId ? `&session=${encodeURIComponent(row.sessionId)}` : ""}`}>Review sessions</Link></Button>
                          <Button size="sm" variant="ghost" asChild><Link href={`/?tab=productionControlTab&floor=${floor}`}>Planner Actions</Link></Button>
                        </div>} />
                    })}
                    {reworkRows.map(row => {
                      const id = `rework:${String(row.jcNo)}`
                      const awaitingMaterial = row.materialPlanningReady === false
                      return <ReviewRow key={id} id={id} floor={floor} job={row.jcNo} part={row.partCode}
                        summary={<><StatusBadge tone="warning" value={awaitingMaterial ? "Awaiting replacement material" : "Route selection required"} />
                          <div>{quantity.format(Number(row.orderPcs))} returned pieces</div></>}
                        details={<div>Original job card {String(row.originalJobCardNumber)} · Received {formatCalendarDate(row.receivedOn)}</div>}
                        action={<Button size="sm" variant="outline" asChild><Link href={awaitingMaterial ? `/?tab=operationalEntryTab&floor=${floor}&entry=rm_inward` : `/?tab=masterGapsTab&floor=${floor}`}>
                          {awaitingMaterial ? "Receive material" : "Select route"}
                        </Link></Button>} />
                    })}
                    {materials.map(row => {
                      const id = `rm:${row.id}`
                      return <ReviewRow key={id} id={id} floor={floor} job={row.jobCardNumber} part={row.partCode}
                        summary={<><StatusBadge tone="warning" value="Raw material pending" />
                          <div className="tabular-nums">Pending {kg(row.pendingKg)}</div></>}
                        details={<>
                          <div>Required {kg(row.requiredKg)} · Received {kg(row.receivedKg)}</div>
                          {row.rejectedKg ? <div>Rejected {kg(row.rejectedKg)} · Usable {kg(row.usableKg)}</div> : null}
                        </>}
                        action={<Button size="sm" variant="outline" disabled={Boolean(savingId) || row.requiredKg === null}
                          onClick={() => { setSelectedMaterial(row); setMaterialReason(""); setMaterialError("") }}>Accept short RM</Button>} />
                    })}
                  </> : null}
                  {queue === "production" ? <>
                    {sessions.map(session => {
                      const id = String(session.id)
                      const reference = String(session.sessionReference ?? id)
                      const efficiency = productionSessionEfficiency({ totalPieces: Number(session.totalPieces), targetPieces: Number(session.targetPieces) })
                      return <ReviewRow key={`session:${id}`} id={`session:${id}`} floor={floor} job={session.jobCardNumber} part={session.partCode}
                        machine={session.machineNumber} setup={session.setupNumber}
                        summary={<>
                          <StatusBadge tone="warning" value={efficiency === null ? "Efficiency unavailable" : `Efficiency ${percentage.format(efficiency * 100)}%`} />
                          <div>Shift {String(session.shift)}</div>
                        </>}
                        details={<>
                          <Link className="underline underline-offset-4" href={`/dashboard/production-sessions?floor=${floor}&session=${encodeURIComponent(id)}`}>{reference} · {formatIstDate(String(session.productionDate))}</Link>
                          <div>Option {String(session.optionNumber)} · {String(session.operatorCode)} {String(session.operatorName)}</div>
                          <div>Produced {quantity.format(Number(session.totalPieces))} · Target {quantity.format(Number(session.targetPieces))}</div>
                        </>}
                        action={<details>
                          <summary className="w-fit cursor-pointer font-medium text-primary">Review flag</summary>
                          <form className="mt-2 grid min-w-44 gap-2" onSubmit={event => void closeFlag(event, session)}>
                            <Label className="sr-only" htmlFor={`efficiency-comment-${id}`}>Closure comment for {reference}</Label>
                            <Textarea id={`efficiency-comment-${id}`} required rows={2} value={comments[id] ?? ""} placeholder="Action taken"
                              disabled={Boolean(savingId)} onChange={event => setComments(current => ({ ...current, [id]: event.target.value }))} />
                            <Button type="submit" size="sm" variant="outline" className="w-fit" disabled={Boolean(savingId) || !(comments[id] ?? "").trim()}>
                              {savingId === `session:${id}` ? "Closing…" : "Close flag"}
                            </Button>
                          </form>
                        </details>} />
                    })}
                    {workflows.map(row => {
                      const key = workflowKey(row)
                      const id = `workflow:${key}`
                      return <ReviewRow key={id} id={id} floor={floor} job={row.jcNo} part={row.partCode}
                        machine={row.machine} setup={row.setupNo}
                        summary={<StatusBadge tone="warning" value="Workflow exception" />}
                        details={<>
                          <div>Option {String(row.optionNumber ?? "—")} · {String(row.setupName || "—")} · {String(row.shopFloorWorker || "—")}</div>
                          <div>{quantity.format(Number(row.rawRows))} production rows · Output {quantity.format(Number(row.rawOutputQty))} · Actual {quantity.format(Number(row.rawActualQty))}</div>
                        </>}
                        action={<Button type="button" size="sm" variant="outline" disabled={Boolean(savingId)} onClick={() => void resolveWorkflow(row)}>
                          <CheckCircle2 />{savingId === id ? "Resolving…" : "Resolve workflow"}
                        </Button>} />
                    })}
                  </> : null}
                </TableBody>
              </OperationalTable>
            ) : null}
          </section>
        <Dialog open={selectedMaterial !== null} onOpenChange={open => { if (!open && !savingId) setSelectedMaterial(null) }}>
          <StandardDialogContent title="Accept short RM" description={`${selectedMaterial?.jobCardNumber ?? ""}: allow Item Complete with the received RM. Original order and receipt quantities stay recorded.`}>
            <form onSubmit={acceptMaterial} className="grid gap-4">
              <FieldGroup><Field><FieldLabel htmlFor="rm-accept-reason">Reason</FieldLabel><Input id="rm-accept-reason" value={materialReason} onChange={event => setMaterialReason(event.target.value)} required disabled={Boolean(savingId)} /></Field></FieldGroup>
              {materialError ? <StandardState variant="error" title="Acceptance failed" description={materialError} /> : null}
              <Button type="submit" className="w-fit" disabled={Boolean(savingId) || !materialReason.trim()}>{savingId ? "Saving…" : "Accept short RM"}</Button>
            </form>
          </StandardDialogContent>
        </Dialog>
      </CardContent>
    </SectionCard>
  )
}
