"use client"

import { useState, type FormEvent } from "react"
import type { createProductionShopFloorRepository } from "@workspace/db"
import { StatusBadge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { StandardState } from "@workspace/ui/components/standard-state"
import { Textarea } from "@workspace/ui/components/textarea"
import { FormSection } from "@/components/ui/golden-patterns"

type Session = Awaited<ReturnType<ReturnType<typeof createProductionShopFloorRepository>["readProductionSessionForDeletion"]>>["rows"][number]

export function DeleteProductionSessionPlannerForm({ floor, onSave }: {
  floor: string
  onSave: (session: Session, reason: string) => Promise<unknown>
}) {
  const [reference, setReference] = useState("")
  const [session, setSession] = useState<Session | null>(null)
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [saved, setSaved] = useState("")
  const blocker = session?.reversedAt ? "This session was already deleted."
    : session?.status === "open" ? "Close the session normally before deleting it."
    : session?.endReason === "item_complete" || session?.requiresSetupReopen ? "Use Reopen Setup to correct Item Complete before deleting this session."
    : ""

  async function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || !reference.trim()) return
    setBusy(true)
    setSession(null)
    setError("")
    setSaved("")
    try {
      const response = await fetch(`/api/production-session-delete?floor=${encodeURIComponent(floor)}&reference=${encodeURIComponent(reference.trim())}`)
      const body: { rows?: Session[]; error?: string } = await response.json()
      if (!response.ok) throw new Error(body.error || "Could not load the session.")
      const found = body.rows?.[0]
      if (!found) throw new Error("Session not found in this Production Unit. Check the Session Reference.")
      setSession(found)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not load the session.")
    } finally {
      setBusy(false)
    }
  }

  async function remove(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!session || !reason.trim() || busy || blocker) return
    setBusy(true)
    setError("")
    try {
      await onSave(session, reason.trim())
      setSaved(`${session.sessionReference} deleted. ${Number(session.goodPieces).toLocaleString("en-IN")} good pieces removed from production totals. Audit history retained.`)
      setSession(null)
      setReason("")
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not delete the session.")
    } finally {
      setBusy(false)
    }
  }

  return <FormSection title="Delete Production Session" width="standard" description="Remove a session entered by mistake. Review its output before applying the deletion.">
    <div className="grid gap-4" aria-busy={busy}>
      <form onSubmit={review} className="grid gap-3">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="session-delete-reference">Session Reference</FieldLabel>
            <Input id="session-delete-reference" value={reference} placeholder="CNC-23-20261011-01" required disabled={busy}
              onChange={event => { setReference(event.target.value); setSession(null); setSaved("") }} />
          </Field>
        </FieldGroup>
        <Button type="submit" variant="outline" className="w-fit" disabled={busy || !reference.trim()}>Review Session</Button>
      </form>
      {busy ? <StandardState variant="loading" title="Checking session" description="Please wait for the current action to finish." /> : null}
      {error ? <StandardState variant="error" title="Could not complete the action" description={error} /> : null}
      {saved ? <p role="status" className="text-sm">{saved}</p> : null}
      {session ? <form onSubmit={remove} className="grid gap-4">
        <div className="grid gap-2">
          <div className="flex flex-wrap items-center gap-2"><strong>{session.sessionReference}</strong><StatusBadge value={session.reversedAt ? "Deleted" : session.status} /></div>
          <p className="text-sm">{session.machineNumber} · {session.jobCardNumber} · {session.partCode} · Setup {session.setupNumber}</p>
          <p className="text-sm">{new Date(String(session.startedAt)).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} to {session.endedAt ? new Date(String(session.endedAt)).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "Open"}</p>
          <p className="text-sm">Output to remove: <strong>{Number(session.goodPieces).toLocaleString("en-IN")} good</strong>, {Number(session.rejectedPieces).toLocaleString("en-IN")} rejected, {Number(session.totalPieces).toLocaleString("en-IN")} total pieces.</p>
          <p className="text-sm text-muted-foreground">The session and its output leave active records. Your reason and the original records remain in the audit history. Machine assignment and setup progress stay as currently recorded.</p>
        </div>
        {blocker ? <StandardState title="Session cannot be deleted" description={session.reversalReason ? `${blocker} ${session.reversalReason}` : blocker} /> : <>
          <FieldGroup><Field>
            <FieldLabel htmlFor="session-delete-reason">Reason for deletion</FieldLabel>
            <Textarea id="session-delete-reason" value={reason} onChange={event => setReason(event.target.value)} required disabled={busy} />
          </Field></FieldGroup>
          <Button type="submit" variant="destructive" className="w-fit" disabled={busy || !reason.trim()}>Delete Reviewed Session</Button>
        </>}
      </form> : null}
    </div>
  </FormSection>
}
