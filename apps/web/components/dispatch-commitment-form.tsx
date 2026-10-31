"use client"

import { useState, type FormEvent } from "react"
import type { ProductionFloorCode } from "@workspace/db/production-floors"
import { Button } from "@workspace/ui/components/button"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { StandardState } from "@workspace/ui/components/standard-state"
import { FormSection } from "@/components/ui/golden-patterns"

export function DispatchCommitmentForm({ committedDispatchDate, floor, jobCardNumber, onSaved }: {
  committedDispatchDate: string
  floor: ProductionFloorCode
  jobCardNumber: string
  onSaved: () => Promise<void>
}) {
  const [date, setDate] = useState(committedDispatchDate)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving || !date) return
    setSaving(true)
    setError("")
    setMessage("")
    try {
      const response = await fetch("/api/job-card-dispatch-commitment", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jcNo: jobCardNumber, productionFloorCode: floor,
          committedDispatchDate: date, expectedCommittedDispatchDate: committedDispatchDate || null }),
      })
      const body = await response.json() as { error?: string; message?: string }
      if (!response.ok) throw new Error(body.error || "Dispatch commitment could not be saved.")
      setMessage(body.message || "Dispatch commitment saved.")
      await onSaved()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Dispatch commitment could not be saved.")
    } finally {
      setSaving(false)
    }
  }

  return <FormSection title="Dispatch Commitment" description="The reminder stays in Planning Control until dispatch is complete, including after the committed date or a partial dispatch." width="compact">
    <form onSubmit={save} className="grid gap-4">
      <FieldGroup><Field>
        <FieldLabel htmlFor="committed-dispatch-date">Committed dispatch date</FieldLabel>
        <Input id="committed-dispatch-date" type="date" value={date} required disabled={saving}
          onChange={event => setDate(event.target.value)} />
        <FieldDescription>Use Planner Actions → Change Priority to bring urgent production forward.</FieldDescription>
      </Field></FieldGroup>
      {error ? <StandardState variant="error" title="Commitment not saved" description={error} /> : null}
      {message ? <p role="status" className="text-sm text-muted-foreground">{message}</p> : null}
      <Button type="submit" className="w-fit" disabled={saving || !date || date === committedDispatchDate}>
        {saving ? "Saving…" : "Save Commitment"}
      </Button>
    </form>
  </FormSection>
}
