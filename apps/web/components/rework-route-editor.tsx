"use client"

import { useState, type FormEvent } from "react"
import { Button } from "@workspace/ui/components/button"
import { Dialog, DialogTrigger } from "@workspace/ui/components/dialog"
import { Field, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { Textarea } from "@workspace/ui/components/textarea"
import { StandardState } from "@workspace/ui/components/standard-state"
import { Plus, Trash2 } from "lucide-react"
import { FormGrid, FormSection, StandardDialogContent } from "@/components/ui/golden-patterns"
import { SearchableSelect } from "@workspace/ui/components/searchable-select"

export function ReworkRouteEditor({ jobCardNumber, machineFamilies, toolingCodes, submitAction }: {
  jobCardNumber: string
  machineFamilies: string[]
  toolingCodes: string[]
  submitAction: (path: string, body: Record<string, unknown>, options?: { throwOnError?: boolean }) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [setups, setSetups] = useState([0])
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    const form = new FormData(event.currentTarget)
    const route = setups.map(id => {
      const value = (name: string) => String(form.get(`${id}-${name}`) ?? "").trim()
      return { setupName: value("setupName"), machineFamily: value("machineFamily"),
        cycleTimeSeconds: Number(value("cycleTimeSeconds")), setupTimeMinutes: Number(value("setupTimeMinutes")),
        stageWeight: Number(value("stageWeight")), operationWeight: Number(value("operationWeight")) || undefined,
        fixture: value("fixture"), tooling: value("tooling"), foamTool: value("foamTool"),
        inspectionChecks: value("inspectionChecks").split(/\r?\n/).map(line => line.trim()).filter(Boolean) }
    })
    setPending(true)
    setError("")
    try {
      await submitAction("rework-route", { jcNo: jobCardNumber, setups: route }, { throwOnError: true })
      setOpen(false)
      setSetups([0])
    } catch (error) {
      setError(error instanceof Error ? error.message : "Rework route could not be saved.")
    } finally {
      setPending(false)
    }
  }

  return <Dialog open={open} onOpenChange={value => { if (!pending) setOpen(value) }}>
    <DialogTrigger asChild><Button type="button" size="sm" variant="outline">Create Rework Route</Button></DialogTrigger>
    <StandardDialogContent title="Create Rework Route" description={`${jobCardNumber} · Used only for this rework activity. Retained with its history.`} className="max-h-[90dvh] overflow-y-auto sm:max-w-4xl">
      <form onSubmit={save} aria-busy={pending} className="grid gap-4">
        {error ? <StandardState variant="error" title="Route not saved" description={error} /> : null}
        <fieldset disabled={pending} className="contents">
          {setups.map((id, index) => {
            const name = (key: string) => `${id}-${key}`
            return <FormSection key={id} title={`Setup ${index + 1}`} width="full">
              <FormGrid>
                <Field><FieldLabel htmlFor={name("setupName")}>Operation / Setup Name</FieldLabel><Input id={name("setupName")} name={name("setupName")} required placeholder="e.g. Thread correction" /></Field>
                <Field><FieldLabel htmlFor={name("machineFamily")}>Machine Family</FieldLabel><SearchableSelect id={name("machineFamily")} name={name("machineFamily")} required defaultValue=""><option value="">Select Machine Family</option>{machineFamilies.map(value => <option key={value} value={value}>{value}</option>)}</SearchableSelect></Field>
                <Field><FieldLabel htmlFor={name("cycleTimeSeconds")}>Cycle Time (seconds / piece)</FieldLabel><Input id={name("cycleTimeSeconds")} name={name("cycleTimeSeconds")} type="number" min="0.001" step="any" required /></Field>
                <Field><FieldLabel htmlFor={name("setupTimeMinutes")}>Setup Time (minutes)</FieldLabel><Input id={name("setupTimeMinutes")} name={name("setupTimeMinutes")} type="number" min="0" step="any" defaultValue="0" required /></Field>
                <Field><FieldLabel htmlFor={name("stageWeight")}>Piece Weight at Setup (grams)</FieldLabel><Input id={name("stageWeight")} name={name("stageWeight")} type="number" min="0.001" step="any" required /></Field>
                <Field><FieldLabel htmlFor={name("operationWeight")}>Weight after Operation (grams, optional)</FieldLabel><Input id={name("operationWeight")} name={name("operationWeight")} type="number" min="0.001" step="any" /></Field>
                {([ ["fixture", "Fixture"], ["tooling", "Tooling"], ["foamTool", "Foam Tool"] ] as const).map(([key, label]) => <Field key={key}><FieldLabel htmlFor={name(key)}>{label} (optional)</FieldLabel>{toolingCodes.length ? <SearchableSelect id={name(key)} name={name(key)} defaultValue=""><option value="">None required</option>{toolingCodes.map(value => <option key={value} value={value}>{value}</option>)}</SearchableSelect> : <Input id={name(key)} name={name(key)} placeholder="Existing Store Asset Code, if required" />}</Field>)}
                <Field className="sm:col-span-2 xl:col-span-3"><FieldLabel htmlFor={name("inspectionChecks")}>First-piece &amp; In-process Checks</FieldLabel><Textarea id={name("inspectionChecks")} name={name("inspectionChecks")} required placeholder="One check per line, e.g. Thread gauge passes freely. Each check is recorded as OK / Not OK." /></Field>
              </FormGrid>
              {setups.length > 1 ? <Button type="button" variant="ghost" size="sm" onClick={() => setSetups(current => current.filter(value => value !== id))}><Trash2 data-icon="inline-start" />Remove Setup {index + 1}</Button> : null}
            </FormSection>
          })}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={setups.length >= 20} onClick={() => setSetups(current => [...current, Math.max(...current) + 1])}><Plus data-icon="inline-start" />Add Setup</Button>
            <Button type="submit">{pending ? "Saving…" : "Save & Use Rework Route"}</Button>
          </div>
        </fieldset>
      </form>
    </StandardDialogContent>
  </Dialog>
}
