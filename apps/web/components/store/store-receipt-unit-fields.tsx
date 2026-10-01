"use client"

import { useState } from "react"

import { Field, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"

export function StoreReceiptUnitFields({
  orderId,
  remainingQuantity,
  serialized,
}: {
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
            <Input id={`receipt-stabilizer-${orderId}`} name="stabilizer_unit_id" placeholder="Existing Unit ID" />
          </Field>
          <Field>
            <FieldLabel htmlFor={`receipt-mcb-${orderId}`}>MCB Number</FieldLabel>
            <Input id={`receipt-mcb-${orderId}`} name="mcb_number" />
          </Field>
        </div>
      ) : null}
    </>
  )
}
