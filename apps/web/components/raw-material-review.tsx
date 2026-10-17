"use client"

import { useState, type FormEvent } from "react"
import Link from "next/link"
import type { createProductionShopFloorRepository } from "@workspace/db"
import type { ProductionFloorCode } from "@workspace/db/production-floors"
import { StatusBadge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { SectionCard, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { Dialog } from "@workspace/ui/components/dialog"
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { StandardState } from "@workspace/ui/components/standard-state"
import { OperationalTable, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@workspace/ui/components/table"
import { StandardDialogContent } from "@/components/ui/golden-patterns"
import { useConditionalRecords } from "@/hooks/use-conditional-records"

type Material = Awaited<ReturnType<ReturnType<typeof createProductionShopFloorRepository>["readRawMaterialReviews"]>>["rows"][number]
const kg = (value: number | null) => value === null ? "Blank weight required" : `${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 3 }).format(value)} kg`

export function RawMaterialReview({ floor, onAccept }: {
  floor: ProductionFloorCode
  onAccept: (row: Material, reason: string) => Promise<unknown>
}) {
  const delivery = useConditionalRecords(`/api/raw-material-review?floor=${encodeURIComponent(floor)}`)
  const rows = (delivery.data?.rows ?? []) as Material[]
  const [selected, setSelected] = useState<Material | null>(null)
  const [reason, setReason] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  async function accept(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected || !reason.trim() || saving) return
    setSaving(true)
    setError("")
    try {
      await onAccept(selected, reason.trim())
      setSelected(null)
      setReason("")
      delivery.refresh()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not accept short RM.")
      delivery.refresh()
    } finally { setSaving(false) }
  }
  return <SectionCard>
    <CardHeader><CardTitle>RM Status</CardTitle></CardHeader>
    <CardContent>
      <OperationalTable filterStorageKey={`rm-status-${floor}`} containerClassName="max-h-[32rem] rounded-lg border"
        state={delivery.error ? "error" : delivery.loading ? "loading" : rows.length ? "ready" : "empty"}
        stateTitle={delivery.error ? "Could not load RM status" : delivery.loading ? "Loading RM status" : "No pending RM"}
        stateDescription={delivery.error || "Full RM has been received for the Job Cards in this Production Unit."}
        stateAction={delivery.error ? <Button onClick={delivery.refresh}>Refresh</Button> : undefined}>
        <TableHeader><TableRow><TableHead>Job Card / Part</TableHead><TableHead className="text-right">Required</TableHead><TableHead className="text-right">Received</TableHead><TableHead className="text-right">Pending</TableHead><TableHead>Status</TableHead><TableHead>Planner action</TableHead></TableRow></TableHeader>
        <TableBody className="[&_td]:whitespace-nowrap">{rows.map(row => <TableRow key={row.id} data-row-id={row.id}>
          <TableCell className="whitespace-nowrap"><Link className="underline underline-offset-4" href={`/dashboard/job-cards/${encodeURIComponent(row.jobCardNumber)}?floor=${floor}`}>{row.jobCardNumber}</Link> · {row.partCode}</TableCell>
          <TableCell className="text-right tabular-nums">{kg(row.requiredKg)}</TableCell>
          <TableCell className="text-right tabular-nums" title={row.rejectedKg ? `${kg(row.rejectedKg)} rejected; ${kg(row.usableKg)} usable` : undefined}>{kg(row.receivedKg)}</TableCell>
          <TableCell className="text-right tabular-nums">{kg(row.pendingKg)}</TableCell>
          <TableCell><StatusBadge tone={row.shortAccepted ? "information" : "warning"} value={row.shortAccepted ? "Short RM accepted" : "RM pending"} /></TableCell>
          <TableCell>{row.shortAccepted ? <span className="block max-w-64 truncate" title={`${String(row.acceptance?.reason ?? "")} · ${String(row.acceptance?.acceptedAt ?? "")}`}>{String(row.acceptance?.reason ?? "Accepted by planner")}</span>
            : <Button size="sm" variant="outline" disabled={row.requiredKg === null} onClick={() => { setSelected(row); setReason(""); setError("") }}>Accept short RM</Button>}</TableCell>
        </TableRow>)}</TableBody>
      </OperationalTable>
      <Dialog open={selected !== null} onOpenChange={open => { if (!open && !saving) setSelected(null) }}>
        <StandardDialogContent title="Accept short RM" description={`${selected?.jobCardNumber ?? ""}: allow Item Complete with the received RM. Original order and receipt quantities stay recorded.`}>
          <form onSubmit={accept} className="grid gap-4">
            <FieldGroup><Field><FieldLabel htmlFor="rm-accept-reason">Reason</FieldLabel><Input id="rm-accept-reason" value={reason} onChange={event => setReason(event.target.value)} required disabled={saving} /></Field></FieldGroup>
            {error ? <StandardState variant="error" title="Acceptance failed" description={error} /> : null}
            <Button type="submit" className="w-fit" disabled={saving || !reason.trim()}>{saving ? "Saving…" : "Accept short RM"}</Button>
          </form>
        </StandardDialogContent>
      </Dialog>
    </CardContent>
  </SectionCard>
}
