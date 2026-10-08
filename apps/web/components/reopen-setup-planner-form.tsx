"use client"

import { useEffect, useState, type FormEvent } from "react"
import type { createProductionShopFloorRepository } from "@workspace/db"
import { Button } from "@workspace/ui/components/button"
import { Label } from "@workspace/ui/components/label"
import { SearchableSelect } from "@workspace/ui/components/searchable-select"
import { StandardState } from "@workspace/ui/components/standard-state"
import { Textarea } from "@workspace/ui/components/textarea"
import { FormSection } from "@/components/ui/golden-patterns"

type CompletedSetup = Awaited<ReturnType<ReturnType<typeof createProductionShopFloorRepository>["readCompletedSetups"]>>["rows"][number]

export function ReopenSetupPlannerForm({ floor, onSave }: {
  floor: string
  onSave: (setup: CompletedSetup, reason: string) => Promise<unknown>
}) {
  const [setups, setSetups] = useState<CompletedSetup[]>([])
  const [selectedId, setSelectedId] = useState("")
  const [reason, setReason] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [saved, setSaved] = useState("")
  const [refresh, setRefresh] = useState(0)
  const selected = setups.find(setup => setup.id === selectedId)

  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      setLoading(true)
      setError("")
      try {
        const response = await fetch(`/api/setup-reopen?floor=${encodeURIComponent(floor)}`, { signal: controller.signal })
        const body: { rows?: CompletedSetup[]; error?: string } = await response.json()
        if (!response.ok) throw new Error(body.error || "Could not load completed setups.")
        setSetups(body.rows ?? [])
        setSelectedId("")
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Could not load completed setups.")
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void load()
    return () => controller.abort()
  }, [floor, refresh])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected || !reason.trim() || saving || loading) return
    setSaving(true)
    setError("")
    setSaved("")
    try {
      await onSave(selected, reason.trim())
      setSaved(`${selected.jobCardNumber}, Setup ${selected.setupNumber} reopened to Planned.`)
      setReason("")
      setRefresh(value => value + 1)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not reopen the setup.")
    } finally {
      setSaving(false)
    }
  }

  return <FormSection title="Reopen Setup" width="standard" description="Correct an Item Complete entry made in error. The setup returns to Planned for scheduling; saved production quantities remain available.">
    <form onSubmit={submit} className="grid gap-4" aria-busy={loading || saving}>
      {loading ? <StandardState variant="loading" title="Loading completed setups" description="Checking the latest saved setup status." /> : null}
      {error ? <StandardState variant="error" title="Could not complete the action" description={error} action={<Button type="button" variant="outline" disabled={saving} onClick={() => setRefresh(value => value + 1)}>Refresh setups</Button>} /> : null}
      {!loading && !error && !setups.length ? <StandardState title="No completed setups" description="Completed setups in this Production Unit will appear here." /> : null}
      {saved ? <p role="status" className="text-sm">{saved}</p> : null}
      {setups.length ? <>
        <div className="grid gap-1.5">
          <Label htmlFor="setup-reopen-target">Completed Job Card / Setup</Label>
          <SearchableSelect id="setup-reopen-target" value={selectedId} onValueChange={setSelectedId} disabled={loading || saving}>
            <option value="">Select completed setup</option>
            {setups.map(setup => <option key={setup.id} value={setup.id}>{setup.jobCardNumber} / {setup.partCode} · Option {setup.optionNumber} · Setup {setup.setupNumber} · {setup.machineNumber}</option>)}
          </SearchableSelect>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="setup-reopen-reason">Reason for reopening</Label>
          <Textarea id="setup-reopen-reason" value={reason} onChange={event => setReason(event.target.value)} required disabled={saving} />
        </div>
        <p className="text-sm text-muted-foreground">Reopening records your reason in history. An Item Complete session close becomes Manual Stop. Other jobs keep their machine assignments. Use the normal planner actions to schedule the remaining work.</p>
        <Button type="submit" className="w-fit" disabled={!selected || !reason.trim() || loading || saving}>{saving ? "Reopening…" : "Reopen to Planned"}</Button>
      </> : null}
    </form>
  </FormSection>
}
