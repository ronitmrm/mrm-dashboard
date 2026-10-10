"use client"

import { useState } from "react"

import { Button } from "@workspace/ui/components/button"
import { NativeSelect, NativeSelectOption } from "@workspace/ui/components/native-select"

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
}: {
  action: (formData: FormData) => Promise<void>
  choices: UnitChoice[]
  destinationStoreCode: string
  lines: RequestLine[]
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
      <div className="grid gap-3 md:grid-cols-2">
        {lines.map((line, index) => (
          <label className="grid gap-1 text-sm font-medium" key={line.id}>
            <span>{line.typeCode} · Physical Unit {index + 1}</span>
            <input name="requisition_id" type="hidden" value={line.id} />
            <NativeSelect
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
          </label>
        ))}
      </div>
      <Button className="justify-self-start" type="submit">
        Confirm and Transfer {lines.length} Unit{lines.length === 1 ? "" : "s"}
      </Button>
    </form>
  )
}
