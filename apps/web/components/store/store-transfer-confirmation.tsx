"use client"

import { useState } from "react"

import { Button } from "@workspace/ui/components/button"
import { NativeSelect, NativeSelectOption } from "@workspace/ui/components/native-select"
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field"
import { StoreStorageLocationField, type StoreStorageLocations } from "./store-storage-location-field"

type RequestLine = {
  id: string
  itemTypeId: string
  requestedUnitCode: string | null
  typeCode: string
}

type UnitChoice = {
  acquiredOn: string | null
  assetCode: string
  itemTypeId: string
  reservedRequestId: string | null
}

export function StoreTransferConfirmation({
  action,
  choices,
  destinationStoreCode,
  lines,
  storageLocations,
}: {
  action: (formData: FormData) => Promise<void>
  choices: UnitChoice[]
  destinationStoreCode: string
  lines: RequestLine[]
  storageLocations: StoreStorageLocations
}) {
  const lineIds = new Set(lines.map((line) => line.id))
  const available = choices.filter((unit) =>
    !unit.reservedRequestId || lineIds.has(unit.reservedRequestId)
  )
  const [selected, setSelected] = useState<Record<string, string>>(() =>
    Object.fromEntries(lines.map((line) => [
      line.id,
      available.some((unit) => unit.assetCode === line.requestedUnitCode)
        ? line.requestedUnitCode! : "",
    ]))
  )

  return (
    <form action={action} className="grid gap-3">
      <input name="destination_store_code" type="hidden" value={destinationStoreCode} />
      <FieldGroup className="grid gap-3 md:grid-cols-2">
        {lines.map((line, index) => (
          <FieldGroup key={line.id}>
          <Field>
            <FieldLabel htmlFor={`transfer-unit-${line.id}`}>{line.typeCode} · Physical Unit {index + 1}</FieldLabel>
            <input name="requisition_id" type="hidden" value={line.id} />
            <NativeSelect
              id={`transfer-unit-${line.id}`}
              aria-label={`${line.typeCode} Physical Unit ${index + 1}`}
              name="asset_code"
              onValueChange={(assetCode) => setSelected((current) => ({
                ...current, [line.id]: assetCode,
              }))}
              required
              value={selected[line.id] ?? ""}
            >
              <NativeSelectOption disabled value="">Select Unit ID</NativeSelectOption>
              {available.filter((unit) => unit.itemTypeId === line.itemTypeId)
                .map((unit) => (
                  <NativeSelectOption
                    disabled={lines.some((other) => other.id !== line.id &&
                      selected[other.id] === unit.assetCode)}
                    key={unit.assetCode}
                    value={unit.assetCode}
                  >
                    {unit.assetCode} · {unit.acquiredOn ?? "Acquisition date unknown"}
                  </NativeSelectOption>
                ))}
            </NativeSelect>
          </Field>
          <StoreStorageLocationField
            id={`batch-transfer-location-${line.id}`}
            itemTypeId={line.itemTypeId}
            name={`destination_location_${line.id}`}
            storage={storageLocations}
            storeCode={destinationStoreCode}
          />
          </FieldGroup>
        ))}
      </FieldGroup>
      <Button className="justify-self-start" type="submit">
        Confirm and Transfer {lines.length} Unit{lines.length === 1 ? "" : "s"}
      </Button>
    </form>
  )
}
