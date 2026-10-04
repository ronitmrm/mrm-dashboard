"use client"

import { useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { Plus, Trash2 } from "lucide-react"

import type { CompletedMaintenanceReport, MaintenanceReportKind } from "@workspace/db"
import { Button } from "@workspace/ui/components/button"
import { CardContent, CardHeader, CardTitle, SectionCard } from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { SearchableSelect } from "@workspace/ui/components/searchable-select"
import { OperationalTable, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@workspace/ui/components/table"
import { Textarea } from "@workspace/ui/components/textarea"

import { MaintenanceWorkPhotos } from "./maintenance-work-photos"

export function CompletedMaintenanceReportEditor({ kind, report }: {
  kind: MaintenanceReportKind
  report: CompletedMaintenanceReport
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [workDone, setWorkDone] = useState(report.workDone ?? "")
  const [remark, setRemark] = useState(report.remark ?? "")
  const [changedItems, setChangedItems] = useState(report.changedItems.length ? report.changedItems : [""])
  const [steps, setSteps] = useState(report.checklistSteps.map((step) => ({ ...step, remark: step.remark ?? "" })))
  const [reason, setReason] = useState("")
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  async function saveChanges(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError("")
    setMessage("")
    setSaving(true)
    try {
      const response = await fetch(`/api/maintenance/reports/${kind}/${report.id}`, {
        body: JSON.stringify({
          changedItems,
          checklistSteps: steps.map(({ id, sequence, value, remark }) => ({ id, sequence, value, remark })),
          reason,
          remark,
          workDone,
        }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      })
      const result = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(result.error || "Report changes could not be saved.")
      setMessage("Report updated. Your reason is saved in the correction history.")
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Report changes could not be saved.")
    } finally {
      setSaving(false)
    }
  }

  if (!report.photoTarget) return null

  return <div className="grid gap-3">
    <Button className="w-fit" onClick={() => setEditing((current) => !current)} size="sm" type="button" variant="outline">
      {editing ? "Close editor" : "Edit completed report"}
    </Button>
    {editing ? <SectionCard width="wide">
      <CardHeader><CardTitle>Correct completed report</CardTitle></CardHeader>
      <CardContent className="grid gap-5">
        <p className="text-sm text-muted-foreground">
          Changes are recorded with your reason. The original completion date and next due date stay the same.
        </p>
        <div className="grid gap-1.5">
          <Label htmlFor="maintenance-report-edit-reason">Reason for correction</Label>
          <Textarea id="maintenance-report-edit-reason" maxLength={500} onChange={(event) => setReason(event.target.value)}
            placeholder="Explain why this completed report needs a change" required value={reason} />
          <p className="text-xs text-muted-foreground">Required for report and photo changes; shown in the correction history.</p>
        </div>
        <form className="grid gap-4" onSubmit={saveChanges}>
          <div className="grid gap-1.5">
            <Label htmlFor="maintenance-report-work-done">Work done</Label>
            <Textarea id="maintenance-report-work-done" maxLength={5000} onChange={(event) => {
              if ((kind === "machine" || report.taskType.toLowerCase() === "breakdown") && remark === workDone) {
                setRemark(event.target.value)
              }
              setWorkDone(event.target.value)
            }} value={workDone} />
          </div>
          {kind === "machine" || report.taskType.toLowerCase() === "breakdown" ? <div className="grid gap-1.5">
            <Label htmlFor="maintenance-report-remark">Overall remark</Label>
            <Textarea id="maintenance-report-remark" maxLength={2000} onChange={(event) => setRemark(event.target.value)} value={remark} />
          </div> : null}
          <div className="grid gap-2">
            <Label>Items changed</Label>
            {changedItems.map((item, index) => <div className="flex min-w-0 gap-2" key={index}>
              <Input aria-label={`Changed item ${index + 1}`} maxLength={200} onChange={(event) => setChangedItems((current) =>
                current.map((value, itemIndex) => itemIndex === index ? event.target.value : value))} value={item} />
              <Button aria-label={`Remove changed item ${index + 1}`} onClick={() => setChangedItems((current) =>
                current.filter((_, itemIndex) => itemIndex !== index))} size="icon-sm" type="button" variant="outline">
                <Trash2 aria-hidden="true" />
              </Button>
            </div>)}
            <Button className="w-fit" onClick={() => setChangedItems((current) => [...current, ""])} size="sm" type="button" variant="outline">
              <Plus aria-hidden="true" /> Add item
            </Button>
          </div>
          {steps.length ? <div className="grid gap-2">
            <Label>Checklist answers</Label>
            <OperationalTable containerClassName="max-h-[60vh] rounded-md border">
              <TableHeader><TableRow>
                <TableHead>Step</TableHead><TableHead>Check Point</TableHead><TableHead>Entry</TableHead><TableHead>Remark</TableHead>
              </TableRow></TableHeader>
              <TableBody>{steps.map((step, index) => <TableRow key={step.id ?? step.sequence}>
                <TableCell>{step.sequence}</TableCell>
                <TableCell className="min-w-64 whitespace-normal">{step.prompt}</TableCell>
                <TableCell>{step.inputType === "checkbox" ? <SearchableSelect
                  aria-label={`Step ${step.sequence} entry`} className="min-w-28" value={step.value}
                  onChange={(event) => setSteps((current) => current.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, value: event.target.value } : item))}>
                  <option value="Yes">Yes</option><option value="No">No</option>
                </SearchableSelect> : <Input aria-label={`Step ${step.sequence} entry`} className="min-w-32"
                  onChange={(event) => setSteps((current) => current.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, value: event.target.value } : item))}
                  type={step.inputType === "number" ? "number" : "text"} value={step.value} />}</TableCell>
                <TableCell><Input aria-label={`Step ${step.sequence} remark`} className="min-w-40"
                  onChange={(event) => setSteps((current) => current.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, remark: event.target.value } : item))} value={step.remark} /></TableCell>
              </TableRow>)}</TableBody>
            </OperationalTable>
          </div> : null}
          <Button className="w-fit" disabled={saving || !reason.trim()} type="submit">
            {saving ? "Saving…" : "Save report changes"}
          </Button>
        </form>
        <div className="grid gap-2 border-t pt-4">
          <p className="text-sm font-medium">Work photos</p>
          <MaintenanceWorkPhotos correctionReason={reason} disabled={saving}
            onChanged={() => { setMessage("Photo change saved in correction history."); router.refresh() }}
            target={report.photoTarget} />
        </div>
        {message ? <p className="text-sm text-primary" role="status">{message}</p> : null}
        {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
      </CardContent>
    </SectionCard> : null}
  </div>
}
