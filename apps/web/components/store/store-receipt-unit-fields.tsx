"use client"

import { useState } from "react"

import { Field, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { SearchableSelect } from "@workspace/ui/components/searchable-select"

export function StoreReceiptUnitFields({
  equipmentUnits,
  orderId,
  remainingQuantity,
  serialized,
}: {
  equipmentUnits: Array<{ assetName: string; status: string; typeCode: string; unitId: string }>
  orderId: string
  remainingQuantity: string
  serialized: boolean
}) {
  const [quantity, setQuantity] = useState(Number(remainingQuantity))

  return (
    <>
      <Field>
        <FieldLabel htmlFor={`receipt-quantity-${orderId}`}>
          Quantity Received
        </FieldLabel>
        <Input
          defaultValue={remainingQuantity}
          id={`receipt-quantity-${orderId}`}
          max={remainingQuantity}
          min={serialized ? "1" : "0.001"}
          name="quantity"
          onChange={(event) => setQuantity(Number(event.target.value))}
          required
          step={serialized ? "1" : "0.001"}
          type="number"
        />
      </Field>
      {serialized && quantity === 1 ? (
        <div className="grid gap-4 sm:col-span-2 sm:grid-cols-2">
          <p className="text-sm text-muted-foreground sm:col-span-2">
            Optional details for this one physical Unit ID. Record actual installation details only when known.
          </p>
          <Field>
            <FieldLabel htmlFor={`receipt-serial-${orderId}`}>
              Manufacturer Serial Number
            </FieldLabel>
            <Input id={`receipt-serial-${orderId}`} name="manufacturer_serial_number" />
          </Field>
          <Field>
            <FieldLabel htmlFor={`receipt-installed-${orderId}`}>
              Installation Date
            </FieldLabel>
            <Input id={`receipt-installed-${orderId}`} name="installed_on" type="date" />
          </Field>
          <Field>
            <FieldLabel htmlFor={`receipt-stabilizer-${orderId}`}>
              Connected Stabiliser Unit ID
            </FieldLabel>
            <SearchableSelect id={`receipt-stabilizer-${orderId}`} name="stabilizer_unit_id" searchPlaceholder="Search Asset Code, name or Unit ID" wrapLabels>
              <option value="">None</option>
              {equipmentUnits.map((unit) => (
                <option key={unit.unitId} value={unit.unitId}>
                  {unit.typeCode} · {unit.assetName} · {unit.unitId} · {unit.status}
                </option>
              ))}
            </SearchableSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor={`receipt-mcb-${orderId}`}>Connected MCB Unit ID</FieldLabel>
            <SearchableSelect id={`receipt-mcb-${orderId}`} name="mcb_number" searchPlaceholder="Search Asset Code, name or Unit ID" wrapLabels>
              <option value="">None</option>
              {equipmentUnits.map((unit) => (
                <option key={unit.unitId} value={unit.unitId}>
                  {unit.typeCode} · {unit.assetName} · {unit.unitId} · {unit.status}
                </option>
              ))}
            </SearchableSelect>
          </Field>
        </div>
      ) : null}
    </>
  )
}
