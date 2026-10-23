"use client"

import { formatCalendarDate } from "@workspace/ui/lib/calendar-date"

import { useState, type FormEvent } from "react"
import Link from "next/link"
import { CheckCircle2 } from "lucide-react"
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
import { useConditionalRecords } from "@/hooks/use-conditional-records"
import { formatIstDate, formatIstDateTime } from "@/lib/date-time"

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

export function PlanningControlReview({ floor, workflowRows, reworkRows = [], onClose, onResolve, onAcceptMaterial }: {
  floor: ProductionFloorCode
  workflowRows: Workflow[]
  reworkRows?: Workflow[]
  onClose: (session: Session, comment: string) => Promise<void>
  onResolve: (row: Workflow) => Promise<void>
  onAcceptMaterial: (row: Material, reason: string) => Promise<unknown>
}) {
  const delivery = useConditionalRecords(
    `/api/production-sessions?floor=${encodeURIComponent(floor)}&efficiencyFlagsOnly=1&limit=500&conditional=1`,
    undefined, undefined, true
  )
  const materialDelivery = useConditionalRecords(`/api/raw-material-review?floor=${encodeURIComponent(floor)}`)
  const [comments, setComments] = useState<Record<string, string>>({})
  const [closedIds, setClosedIds] = useState<string[]>([])
  const [resolvedKeys, setResolvedKeys] = useState<string[]>([])
  const [savingId, setSavingId] = useState("")
  const [error, setError] = useState("")
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null)
  const [materialReason, setMaterialReason] = useState("")
  const [materialError, setMaterialError] = useState("")
  const sessions = Array.isArray(delivery.data?.rows)
    ? (delivery.data.rows as Session[]).filter(session => !closedIds.includes(String(session.id)))
    : []
  const materials = (materialDelivery.data?.rows ?? []) as Material[]
  const materialFlowReviews = (materialDelivery.data?.materialFlowReviews ?? []) as MaterialFlowReview[]
  const workflows = workflowRows.filter(row => !resolvedKeys.includes(workflowKey(row)))
  const loading = delivery.loading || materialDelivery.loading
  const loadError = [
    delivery.error ? `Session flags: ${delivery.error}` : "",
    materialDelivery.error ? `RM status: ${materialDelivery.error}` : "",
  ].filter(Boolean).join(" ")

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
      setSelectedMaterial(null)
      setMaterialReason("")
      materialDelivery.refresh()
    } catch (failure) {
      setMaterialError(failure instanceof Error ? failure.message : "Could not accept short RM.")
      materialDelivery.refresh()
    } finally { setSavingId("") }
  }

  return (
    <SectionCard>
      <CardHeader><CardTitle>Planning Review</CardTitle></CardHeader>
      <CardContent className="grid min-w-0 gap-3">
        {loading ? <StandardState variant="loading" title="Loading planning flags" description="Checking RM status, session flags and workflow exceptions in this Production Unit." /> : null}
        {loadError || error ? <StandardState variant="error" title="Could not complete the review" description={error || loadError}
          action={<Button variant="outline" onClick={refresh}>Refresh flags</Button>} /> : null}
        {!loading && !loadError && !materials.length && !materialFlowReviews.length && !sessions.length && !workflows.length && !reworkRows.length ? (
          <StandardState title="No open planning reviews" description="No RM shortages, session flags or workflow exceptions need review." />
        ) : null}
        {materials.length || materialFlowReviews.length || sessions.length || workflows.length || reworkRows.length ? (
          <OperationalTable filterStorageKey={`planning-control-flags-${floor}`} containerClassName="max-h-[70vh] rounded-lg border">
            <TableHeader><TableRow>
              <TableHead>Flag Type</TableHead>
              <TableHead>Job Card / Part / Setup</TableHead>
              <TableHead>Machine</TableHead>
              <TableHead>Session / Date</TableHead>
              <TableHead className="min-w-64">Details</TableHead>
              <TableHead className="min-w-72">Action</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {reworkRows.map(row => (
                <TableRow key={`rework:${String(row.jcNo)}`} data-row-id={`rework:${String(row.jcNo)}`}>
                  <TableCell><StatusBadge tone="warning" value={row.materialPlanningReady === false ? "Replacement — Awaiting New RM" : "Revision — Route Selection Required"} /></TableCell>
                  <TableCell><Link className="font-medium underline underline-offset-4" href={`/dashboard/job-cards/${encodeURIComponent(String(row.jcNo))}?floor=${floor}`}>{String(row.jcNo)}</Link><div>{String(row.partCode)}</div></TableCell>
                  <TableCell>—</TableCell><TableCell>{formatCalendarDate(row.receivedOn)}</TableCell>
                  <TableCell>{quantity.format(Number(row.orderPcs))} returned pieces · Original: {String(row.originalJobCardNumber)}</TableCell>
                  <TableCell><Button size="sm" variant="outline" asChild><Link href={row.materialPlanningReady === false ? `/?tab=operationalEntryTab&floor=${floor}&entry=rm_inward` : `/?tab=masterGapsTab&floor=${floor}`}>{row.materialPlanningReady === false ? "Receive new RM for this revision" : "Select route in Part Readiness"}</Link></Button></TableCell>
                </TableRow>
              ))}
              {materials.map(row => (
                <TableRow key={`rm:${row.id}`} data-row-id={`rm:${row.id}`}>
                  <TableCell><StatusBadge tone={row.shortAccepted ? "information" : "warning"} value="RM status" /></TableCell>
                  <TableCell>
                    <Link className="font-medium underline underline-offset-4" href={`/dashboard/job-cards/${encodeURIComponent(row.jobCardNumber)}?floor=${floor}`}>{row.jobCardNumber}</Link>
                    <div>{row.partCode}</div>
                  </TableCell>
                  <TableCell>—</TableCell><TableCell>—</TableCell>
                  <TableCell className="tabular-nums">
                    <div>Required: {kg(row.requiredKg)} · Received: {kg(row.receivedKg)}</div>
                    {row.rejectedKg ? <div>Rejected: {kg(row.rejectedKg)} · Usable: {kg(row.usableKg)}</div> : null}
                    <div>Pending: {kg(row.pendingKg)}</div>
                    <StatusBadge tone={row.shortAccepted ? "information" : "warning"} value={row.shortAccepted ? "Short RM accepted" : "RM pending"} />
                  </TableCell>
                  <TableCell>{row.shortAccepted ? (
                    <span className="block max-w-72 break-words" title={formatIstDateTime(String(row.acceptance?.acceptedAt ?? ""))}>{String(row.acceptance?.reason ?? "Accepted by planner")}</span>
                  ) : <Button size="sm" variant="outline" disabled={Boolean(savingId) || row.requiredKg === null}
                    onClick={() => { setSelectedMaterial(row); setMaterialReason(""); setMaterialError("") }}>Accept short RM</Button>}</TableCell>
                </TableRow>
              ))}
              {materialFlowReviews.map(row => (
                <TableRow key={`material-flow:${row.id}`} data-row-id={`material-flow:${row.id}`}>
                  <TableCell><StatusBadge tone="warning" value="Material flow conflict" /></TableCell>
                  <TableCell>
                    <Link className="font-medium underline underline-offset-4" href={`/dashboard/job-cards/${encodeURIComponent(row.jobCardNumber)}?floor=${floor}`}>{row.jobCardNumber}</Link>
                    <div>{row.partCode}</div>
                    <div className="text-xs text-muted-foreground">Option {row.optionNumber} · Setup {row.setupNumber}</div>
                  </TableCell>
                  <TableCell className="font-medium">{row.machineNumber}</TableCell>
                  <TableCell>—</TableCell>
                  <TableCell>
                    <div className="max-w-80 whitespace-normal">Setup {row.upstreamSetupNumber} is Item Complete, but Setup {row.setupNumber} was released awaiting material.</div>
                    <div className="tabular-nums">Upstream good: {quantity.format(row.upstreamGoodPieces)} · Setup processed: {quantity.format(row.setupProcessedPieces)}</div>
                    <div className="max-w-80 whitespace-normal text-xs text-muted-foreground">Review production counts. Reopen the upstream setup if unfinished work remains.</div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" asChild><Link href={`/dashboard/production-sessions?floor=${floor}${row.sessionId ? `&session=${encodeURIComponent(row.sessionId)}` : ""}`}>Review sessions</Link></Button>
                      <Button size="sm" variant="outline" asChild><Link href={`/?tab=productionControlTab&floor=${floor}`}>Planner Actions</Link></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {sessions.map(session => {
                const id = String(session.id)
                const reference = String(session.sessionReference ?? id)
                const efficiency = productionSessionEfficiency({ totalPieces: Number(session.totalPieces), targetPieces: Number(session.targetPieces) })
                return (
                  <TableRow key={`session:${id}`} data-row-id={`session:${id}`}>
                    <TableCell><StatusBadge tone="warning" value="Session flag" /></TableCell>
                    <TableCell>
                      <Link className="font-medium underline underline-offset-4" href={`/dashboard/job-cards/${encodeURIComponent(String(session.jobCardNumber))}?floor=${floor}`}>{String(session.jobCardNumber)}</Link>
                      <div>{String(session.partCode)}</div>
                      <div className="text-xs text-muted-foreground">Option {String(session.optionNumber)} · Setup {String(session.setupNumber)}</div>
                    </TableCell>
                    <TableCell className="font-medium">{String(session.machineNumber)}</TableCell>
                    <TableCell>
                      <Link className="font-mono text-xs underline underline-offset-4" href={`/dashboard/production-sessions?floor=${floor}&session=${encodeURIComponent(id)}`}>{reference}</Link>
                      <div className="mt-1 text-xs text-muted-foreground">{formatIstDate(String(session.productionDate))}</div>
                    </TableCell>
                    <TableCell>
                      <div>{String(session.operatorCode)} · {String(session.operatorName)}</div>
                      <div className="text-xs text-muted-foreground">Shift {String(session.shift)}</div>
                      <div className="tabular-nums">Produced: {quantity.format(Number(session.totalPieces))} · Target: {quantity.format(Number(session.targetPieces))}</div>
                      <div>Efficiency: <StatusBadge tone="warning" value={efficiency === null ? "Unavailable" : `${percentage.format(efficiency * 100)}%`} /></div>
                    </TableCell>
                    <TableCell>
                      <form className="grid gap-2" onSubmit={event => void closeFlag(event, session)}>
                        <Label className="sr-only" htmlFor={`efficiency-comment-${id}`}>Closure comment for {reference}</Label>
                        <Textarea id={`efficiency-comment-${id}`} required rows={2} value={comments[id] ?? ""} placeholder="Review / action taken"
                          disabled={Boolean(savingId)} onChange={event => setComments(current => ({ ...current, [id]: event.target.value }))} />
                        <Button type="submit" variant="outline" className="w-fit" disabled={Boolean(savingId) || !(comments[id] ?? "").trim()}>
                          {savingId === `session:${id}` ? "Closing…" : "Close flag"}
                        </Button>
                      </form>
                    </TableCell>
                  </TableRow>
                )
              })}
              {workflows.map(row => {
                const key = workflowKey(row)
                return (
                  <TableRow key={`workflow:${key}`} data-row-id={`workflow:${key}`}>
                    <TableCell><StatusBadge tone="warning" value="Workflow exception" /></TableCell>
                    <TableCell>
                      <Link className="font-medium underline underline-offset-4" href={`/dashboard/job-cards/${encodeURIComponent(String(row.jcNo ?? ""))}?floor=${floor}`}>{String(row.jcNo ?? "—")}</Link>
                      <div>{String(row.partCode ?? "—")}</div>
                      <div className="text-xs text-muted-foreground">Option {String(row.optionNumber ?? "—")} · Setup {String(row.setupNo ?? "—")}</div>
                      <div className="text-xs text-muted-foreground">{String(row.setupName ?? "")}</div>
                    </TableCell>
                    <TableCell className="font-medium">{String(row.machine ?? "—")}</TableCell>
                    <TableCell>—</TableCell>
                    <TableCell>
                      <div>{String(row.shopFloorWorker || "—")}</div>
                      <div className="tabular-nums">{quantity.format(Number(row.rawRows))} production rows</div>
                      <div className="text-xs text-muted-foreground">Output {quantity.format(Number(row.rawOutputQty))} / Actual {quantity.format(Number(row.rawActualQty))}</div>
                    </TableCell>
                    <TableCell>
                      <Button type="button" size="sm" variant="outline" disabled={Boolean(savingId)} onClick={() => void resolveWorkflow(row)}>
                        <CheckCircle2 className="size-4" />{savingId === `workflow:${key}` ? "Resolving…" : "Resolve workflow"}
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </OperationalTable>
        ) : null}
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
