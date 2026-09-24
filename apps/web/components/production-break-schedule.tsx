"use client"

import type { ProductionFloorCode } from "@workspace/db/production-floors"
import { Button } from "@workspace/ui/components/button"
import { CardContent, CardDescription, CardHeader, CardTitle, SectionCard } from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { OperationalTable, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@workspace/ui/components/table"
import { ArrowLeft, Plus, Trash2 } from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"

import { PageHeader, StandardState } from "@/components/ui/golden-patterns"

type Break = { startTime: string; endTime: string }
type ScheduleResponse = { breaks?: Break[]; error?: string }

export function ProductionBreakSchedule({
  canManage,
  floor,
}: {
  canManage: boolean
  floor: ProductionFloorCode
}) {
  const [breaks, setBreaks] = useState<Break[]>([])
  const [savedBreaks, setSavedBreaks] = useState<Break[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")

  useEffect(() => {
    let active = true
    void fetch(`/api/production-break-schedule?floor=${encodeURIComponent(floor)}`, {
      cache: "no-store", credentials: "same-origin",
    }).then(async (response) => {
      const body = await response.json() as ScheduleResponse
      if (!response.ok) throw new Error(body.error || "Break schedule could not be loaded.")
      if (active) {
        setBreaks(body.breaks ?? [])
        setSavedBreaks(body.breaks ?? [])
      }
    }).catch((reason) => {
      if (active) setError(reason instanceof Error ? reason.message : "Break schedule could not be loaded.")
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [floor])

  const dirty = JSON.stringify(breaks) !== JSON.stringify(savedBreaks)
  const canSave = canManage && dirty && !saving && breaks.every((row) =>
    row.startTime && row.endTime)

  async function save() {
    if (!canSave) return
    setSaving(true)
    setError("")
    setMessage("")
    try {
      const response = await fetch("/api/production-break-schedule", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ productionFloorCode: floor, breaks }),
      })
      const body = await response.json() as ScheduleResponse
      if (!response.ok) throw new Error(body.error || "Break schedule could not be saved.")
      setBreaks(body.breaks ?? [])
      setSavedBreaks(body.breaks ?? [])
      setMessage("Break schedule saved for new production sessions.")
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Break schedule could not be saved.")
    } finally {
      setSaving(false)
    }
  }

  return <section className="grid gap-4">
    <PageHeader
      title="Production Break Schedule"
      description="Daily break times in IST. Only overlapping minutes are removed from productive runtime; breaks are not downtime."
      actions={<Button asChild variant="outline"><Link href="/masters"><ArrowLeft />Back to Masters</Link></Button>}
    />
    <SectionCard>
      <CardHeader>
        <CardTitle>Break-time master</CardTitle>
        <CardDescription>Changes apply to sessions started afterward. Existing sessions retain their saved schedule.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {loading ? <StandardState variant="loading" title="Loading breaks" description="Reading the production unit schedule." /> : null}
        {error ? <StandardState variant="error" title="Break schedule unavailable" description={error} /> : null}
        {!loading ? <div className="min-w-0 rounded-md border">
          <OperationalTable>
            <TableHeader><TableRow><TableHead>Start (IST)</TableHead><TableHead>End (IST)</TableHead>{canManage ? <TableHead /> : null}</TableRow></TableHeader>
            <TableBody>{breaks.length ? breaks.map((item, index) =>
              <TableRow key={index}>
                <TableCell>{canManage ? <Input aria-label={`Break ${index + 1} start`} type="time" value={item.startTime} onChange={(event) => setBreaks((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, startTime: event.target.value } : row))} /> : item.startTime}</TableCell>
                <TableCell>{canManage ? <Input aria-label={`Break ${index + 1} end`} type="time" value={item.endTime} onChange={(event) => setBreaks((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, endTime: event.target.value } : row))} /> : item.endTime}</TableCell>
                {canManage ? <TableCell className="text-right"><Button aria-label={`Remove break ${index + 1}`} size="icon" variant="outline" onClick={() => setBreaks((current) => current.filter((_, rowIndex) => rowIndex !== index))}><Trash2 /></Button></TableCell> : null}
              </TableRow>
            ) : <TableRow><TableCell colSpan={canManage ? 3 : 2} className="py-8 text-center text-muted-foreground">No breaks configured.</TableCell></TableRow>}</TableBody>
          </OperationalTable>
        </div> : null}
        {message ? <p role="status" className="text-sm text-foreground">{message}</p> : null}
        {canManage && !loading ? <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={saving || breaks.length >= 24} onClick={() => setBreaks((current) => [...current, { startTime: "", endTime: "" }])}><Plus />Add break</Button>
          <Button disabled={!canSave} onClick={save}>{saving ? "Saving…" : "Save schedule"}</Button>
        </div> : null}
      </CardContent>
    </SectionCard>
  </section>
}
