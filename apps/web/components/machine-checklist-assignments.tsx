"use client"

import { useId, useState, type FormEvent } from "react"
import type { ProductionFloorCode } from "@workspace/db/production-floors"
import { Button } from "@workspace/ui/components/button"
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  SectionCard,
} from "@workspace/ui/components/card"
import { Field, FieldDescription, FieldLabel } from "@workspace/ui/components/field"
import { NativeSelect, NativeSelectOption } from "@workspace/ui/components/native-select"
import { StandardState } from "@workspace/ui/components/standard-state"
import {
  OperationalTable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { FormGrid } from "@/components/ui/golden-patterns"
import { useConditionalRecords } from "@/hooks/use-conditional-records"

type AssignmentProps = {
  productionFloorCode: ProductionFloorCode
  canManage?: boolean
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function records(value: unknown) {
  return Array.isArray(value) ? value.map(record) : []
}

function text(value: unknown) {
  return String(value ?? "").trim()
}

export function MachineChecklistAssignments(props: AssignmentProps) {
  return <MachineChecklistAssignmentPanel key={props.productionFloorCode} {...props} />
}

function MachineChecklistAssignmentPanel({
  productionFloorCode,
  canManage = false,
}: AssignmentProps) {
  const delivery = useConditionalRecords(
    `/api/setup-checklist-assignments?floor=${encodeURIComponent(productionFloorCode)}`
  )
  const controlsId = useId()
  const [machineNumber, setMachineNumber] = useState("")
  const [checklistCode, setChecklistCode] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [saved, setSaved] = useState("")
  const rows = records(delivery.data?.rows).map((row) => ({
    machineNumber: text(row.machineNumber),
    machineType: text(row.machineType),
    location: text(row.location),
    checklistCode: text(row.checklistCode),
    checklistTitle: text(row.checklistTitle),
  }))
  const checklists = records(delivery.data?.checklists).map((row) => ({
    code: text(row.code),
    title: text(row.title),
  }))
  const selected = rows.find((row) => row.machineNumber === machineNumber)
  const activeChecklist = checklists.some((checklist) => checklist.code === checklistCode)
  const canSave = canManage && selected && !saving && !delivery.error &&
    (!checklistCode || activeChecklist) && selected.checklistCode !== checklistCode

  function selectMachine(value: string) {
    setMachineNumber(value)
    setChecklistCode(rows.find((row) => row.machineNumber === value)?.checklistCode ?? "")
    setError("")
    setSaved("")
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSave) return
    setSaving(true)
    setError("")
    setSaved("")
    try {
      const response = await fetch("/api/setup-checklist-assignment", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productionFloorCode, machineNumber, checklistCode }),
      })
      const result = record(await response.json().catch(() => ({})))
      if (!response.ok) {
        throw new Error(text(result.error) || "The checklist assignment could not be saved.")
      }
      setSaved(`${machineNumber}: ${checklistCode || "Unassigned"} saved.`)
      delivery.refresh()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The checklist assignment could not be saved.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <SectionCard>
      <CardHeader>
        <CardTitle>Machine checklist assignments</CardTitle>
        <CardDescription>
          Assign one checklist to each machine. A checklist can be shared by multiple machines.
          Applies from next setup. Existing checklist work keeps its original checklist.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {delivery.loading ? (
          <StandardState variant="loading" title="Loading machine assignments" description="Checking machines and active checklists in this production unit." />
        ) : null}
        {delivery.error || error ? (
          <StandardState
            variant="error"
            title="Could not complete the action"
            description={error || delivery.error}
            action={<Button type="button" variant="outline" onClick={delivery.refresh}>Refresh assignments</Button>}
          />
        ) : null}
        {saved ? <p role="status" className="text-sm">{saved}</p> : null}
        {!delivery.loading && !delivery.error && !rows.length ? (
          <StandardState title="No machines available" description="Active machines in this production unit appear here." />
        ) : null}
        {canManage && rows.length ? (
          <form onSubmit={save} className="grid gap-3" aria-busy={saving}>
            <fieldset className="contents" disabled={saving || delivery.accessDenied}>
              <FormGrid className="max-w-2xl xl:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor={`${controlsId}-machine`}>Machine</FieldLabel>
                  <NativeSelect id={`${controlsId}-machine`} value={machineNumber} onValueChange={selectMachine} required>
                    <NativeSelectOption value="">Select machine</NativeSelectOption>
                    {rows.map((row) => (
                      <NativeSelectOption key={row.machineNumber} value={row.machineNumber}>
                        {[row.machineNumber, row.machineType].filter(Boolean).join(" · ")}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
                <Field>
                  <FieldLabel htmlFor={`${controlsId}-checklist`}>Setup checklist</FieldLabel>
                  <NativeSelect
                    id={`${controlsId}-checklist`}
                    value={checklistCode}
                    disabled={!selected}
                    onValueChange={(value) => { setChecklistCode(value); setError(""); setSaved("") }}
                  >
                    <NativeSelectOption value="">Unassigned</NativeSelectOption>
                    {selected?.checklistCode && !checklists.some((checklist) => checklist.code === selected.checklistCode) ? (
                      <NativeSelectOption value={selected.checklistCode} disabled>
                        {selected.checklistCode} · {selected.checklistTitle || "Inactive checklist"} (unavailable)
                      </NativeSelectOption>
                    ) : null}
                    {checklists.map((checklist) => (
                      <NativeSelectOption key={checklist.code} value={checklist.code}>
                        {checklist.code} · {checklist.title}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                  {!checklists.length ? <FieldDescription>Create an active checklist before assigning it to a machine.</FieldDescription> : null}
                </Field>
              </FormGrid>
              <Button type="submit" className="w-fit" disabled={!canSave}>
                {saving ? "Saving…" : "Save assignment"}
              </Button>
            </fieldset>
          </form>
        ) : null}
        {rows.length ? (
          <OperationalTable filterStorageKey={`machine-checklist-assignments-${productionFloorCode}`} containerClassName="max-h-96 rounded-md border">
            <TableHeader>
              <TableRow>
                <TableHead>Machine</TableHead>
                <TableHead>Machine type</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Assigned checklist</TableHead>
                {canManage ? <TableHead>Action</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.machineNumber} data-row-id={row.machineNumber}>
                  <TableCell className="font-medium">{row.machineNumber}</TableCell>
                  <TableCell>{row.machineType || "—"}</TableCell>
                  <TableCell>{row.location || "—"}</TableCell>
                  <TableCell>{row.checklistCode ? [row.checklistCode, row.checklistTitle].filter(Boolean).join(" · ") : "Unassigned"}</TableCell>
                  {canManage ? (
                    <TableCell>
                      <Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => selectMachine(row.machineNumber)} aria-label={`Edit checklist assignment for ${row.machineNumber}`}>
                        Edit assignment
                      </Button>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </OperationalTable>
        ) : null}
      </CardContent>
    </SectionCard>
  )
}
