"use client"

import { useState, type FormEvent } from "react"
import Link from "next/link"
import type { createProductionShopFloorRepository } from "@workspace/db"
import { Button } from "@workspace/ui/components/button"
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { SearchableSelect } from "@workspace/ui/components/searchable-select"
import { StandardState } from "@workspace/ui/components/standard-state"
import { FormSection } from "@/components/ui/golden-patterns"
import { useConditionalRecords } from "@/hooks/use-conditional-records"

type Setup = Awaited<ReturnType<ReturnType<typeof createProductionShopFloorRepository>["readReleasableSetups"]>>["rows"][number]

export function ReleaseSetupPlannerForm({ floor, onSave }: {
  floor: string
  onSave: (setup: Setup, reason: string) => Promise<unknown>
}) {
  const delivery = useConditionalRecords(`/api/setup-release?floor=${encodeURIComponent(floor)}`)
  const rows = (delivery.data?.rows ?? []) as Setup[]
  const [selectedId, setSelectedId] = useState("")
  const [reason, setReason] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [saved, setSaved] = useState("")
  const selected = rows.find(row => row.id === selectedId)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected || selected.openSessionId || !reason.trim() || saving) return
    setSaving(true)
    setError("")
    setSaved("")
    try {
      await onSave(selected, reason.trim())
      setSaved(`${selected.machineNumber} released. Setup ${selected.setupNumber} waits for more RM or WIP.`)
      setSelectedId("")
      setReason("")
      delivery.refresh()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not release the machine.")
      delivery.refresh()
    } finally { setSaving(false) }
  }
  return <FormSection title="Release machine — awaiting material" width="standard"
    description="Release one setup's machine while waiting for RM or WIP. Production and remaining order quantity stay recorded; other setups keep running.">
    <form onSubmit={submit} className="grid gap-4">
      {delivery.loading ? <StandardState variant="loading" title="Loading active setups" description="Checking current machine assignments." /> : null}
      {delivery.error || error ? <StandardState variant="error" title="Could not complete the action" description={error || delivery.error} action={<Button type="button" onClick={delivery.refresh}>Refresh setups</Button>} /> : null}
      {saved ? <p role="status">{saved}</p> : null}
      {!delivery.loading && !delivery.error && !rows.length ? <StandardState title="No active setups to release" description="Active unfinished setups appear here." /> : null}
      {rows.length ? <>
        <FieldGroup>
          <Field><FieldLabel htmlFor="release-setup">Job Card / Setup / Machine</FieldLabel>
            <SearchableSelect id="release-setup" value={selectedId} onValueChange={setSelectedId} disabled={saving}>
              <option value="">Select setup</option>{rows.map(row => <option key={row.id} value={row.id}>{row.jobCardNumber} / {row.partCode} · Setup {row.setupNumber} · {row.machineNumber}</option>)}
            </SearchableSelect>
          </Field>
          <Field><FieldLabel htmlFor="release-reason">Reason</FieldLabel><Input id="release-reason" value={reason} onChange={event => setReason(event.target.value)} required disabled={saving} placeholder="Waiting for balance RM / upstream WIP" /></Field>
        </FieldGroup>
        {selected?.openSessionId ? <StandardState title="Close the Production Session first"
          description="Use Manual Stop and record actual output before releasing this machine."
          action={<Button asChild variant="outline"><Link href={`/dashboard/production-sessions?floor=${encodeURIComponent(floor)}&session=${encodeURIComponent(selected.openSessionId)}`}>Open session</Link></Button>} /> : null}
        <Button type="submit" className="w-fit" disabled={!selected || Boolean(selected.openSessionId) || !reason.trim() || saving}>{saving ? "Releasing…" : "Release machine"}</Button>
      </> : null}
    </form>
  </FormSection>
}
