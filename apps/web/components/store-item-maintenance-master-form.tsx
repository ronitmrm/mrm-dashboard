"use client"

import { useState } from "react"

import { Button } from "@workspace/ui/components/button"
import { Field, FieldDescription, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import { StandardState } from "@workspace/ui/components/standard-state"

import { FormGrid } from "@/components/ui/golden-patterns"

type MaintenanceMaster = {
  id: string
  code: string
  name: string
  frequencyDays: number
  checklistCode: string | null
}

export function StoreItemMaintenanceMasterForm({
  action,
  assetCode,
  masters,
}: {
  action: (formData: FormData) => Promise<void>
  assetCode: string
  masters: MaintenanceMaster[]
}) {
  const [selectedId, setSelectedId] = useState("")
  const selected = masters.find((master) => master.id === selectedId)

  if (!masters.length) {
    return (
      <StandardState
        title="No unassigned Maintenance Masters"
        description="All available Maintenance Masters are already assigned, or no active Calendar Days Master exists."
      />
    )
  }

  return (
    <form action={action} className="grid gap-4">
      <input name="item_type_code" type="hidden" value={assetCode} />
      <FormGrid className="xl:grid-cols-2">
        <Field className="sm:col-span-2">
          <FieldLabel htmlFor="item-maintenance-master">Maintenance Master</FieldLabel>
          <NativeSelect
            className="w-full"
            id="item-maintenance-master"
            name="definition_id"
            onChange={(event) => setSelectedId(event.target.value)}
            required
            value={selected?.id ?? ""}
          >
            <NativeSelectOption value="">Select a maintenance schedule</NativeSelectOption>
            {masters.map((master) => (
              <NativeSelectOption key={master.id} value={master.id}>
                {master.code} · {master.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor="item-maintenance-code">Schedule Code</FieldLabel>
          <Input id="item-maintenance-code" readOnly value={selected?.code ?? ""} />
        </Field>
        <Field>
          <FieldLabel htmlFor="item-maintenance-name">Schedule Name</FieldLabel>
          <Input id="item-maintenance-name" readOnly value={selected?.name ?? ""} />
        </Field>
        <Field>
          <FieldLabel htmlFor="item-maintenance-frequency">Frequency (days)</FieldLabel>
          <Input
            id="item-maintenance-frequency"
            readOnly
            value={selected ? String(selected.frequencyDays) : ""}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="item-maintenance-checklist">Checklist Code</FieldLabel>
          <Input
            id="item-maintenance-checklist"
            readOnly
            value={selected?.checklistCode || ""}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="item-maintenance-first-due">First Due Date</FieldLabel>
          <Input id="item-maintenance-first-due" name="first_due_on" required type="date" />
          <FieldDescription>
            Applies to existing Unit IDs. New units start from their acquisition date plus the Master frequency.
          </FieldDescription>
        </Field>
      </FormGrid>
      <Button className="w-fit" disabled={!selected} type="submit">
        Assign Schedule
      </Button>
    </form>
  )
}
