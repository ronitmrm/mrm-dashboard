"use client"

import { useState } from "react"

import { Button } from "@workspace/ui/components/button"
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"

import { moveStoreAssetAction } from "@/app/store/actions"

type MovementUnit = {
  assetCode: string
  assetName: string
  holderName: string | null
  status: string
}

type MovementDestination = "DEPARTMENT" | "MACHINE" | "STORE" | "VENDOR"

export function StoreMovementForm({
  initialUnitId,
  locations,
  performer,
  units,
  vendors,
}: {
  initialUnitId: string
  locations: { code: string; name: string }[]
  performer: string
  units: MovementUnit[]
  vendors: { code: string; id: string; name: string }[]
}) {
  const [destination, setDestination] = useState<MovementDestination>("VENDOR")

  return (
    <form action={moveStoreAssetAction} className="grid gap-4">
      <FieldGroup className="gap-4">
        <Field>
          <FieldLabel htmlFor="movement-unit">Unit ID</FieldLabel>
          <NativeSelect
            defaultValue={initialUnitId}
            id="movement-unit"
            name="asset_code"
            required
          >
            <NativeSelectOption value="">Select Unit ID</NativeSelectOption>
            {units.map((unit) => (
              <NativeSelectOption key={unit.assetCode} value={unit.assetCode}>
                {unit.assetCode} — {unit.assetName} · {unit.holderName ?? unit.status}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor="movement-destination">Move To</FieldLabel>
          <NativeSelect
            id="movement-destination"
            name="holder_type"
            onChange={(event) =>
              setDestination(event.target.value as MovementDestination)
            }
            value={destination}
          >
            <NativeSelectOption value="VENDOR">Vendor</NativeSelectOption>
            <NativeSelectOption value="MACHINE">Machine</NativeSelectOption>
            <NativeSelectOption value="DEPARTMENT">Department</NativeSelectOption>
            <NativeSelectOption value="STORE">Store Return</NativeSelectOption>
          </NativeSelect>
        </Field>
        {destination === "VENDOR" ? (
          <Field>
            <FieldLabel htmlFor="movement-vendor">Vendor</FieldLabel>
            <NativeSelect id="movement-vendor" name="vendor_id" required>
              <NativeSelectOption value="">Select Vendor</NativeSelectOption>
              {vendors.map((vendor) => (
                <NativeSelectOption key={vendor.id} value={vendor.id}>
                  {vendor.code} — {vendor.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
        ) : destination === "STORE" ? (
          <Field>
            <FieldLabel htmlFor="movement-store">Store Location</FieldLabel>
            <NativeSelect id="movement-store" name="holder_reference" required>
              <NativeSelectOption value="">Select Store Location</NativeSelectOption>
              {locations.map((location) => (
                <NativeSelectOption key={location.code} value={location.code}>
                  {location.code} — {location.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
        ) : (
          <>
            <Field>
              <FieldLabel htmlFor="movement-reference">
                {destination === "MACHINE" ? "Machine Number" : "Department Code"}
              </FieldLabel>
              <Input id="movement-reference" name="holder_reference" required />
            </Field>
            <Field>
              <FieldLabel htmlFor="movement-name">
                {destination === "MACHINE" ? "Machine Name" : "Department Name"}
              </FieldLabel>
              <Input id="movement-name" name="holder_name" required />
            </Field>
          </>
        )}
        <Field>
          <FieldLabel htmlFor="movement-performer">Moved By</FieldLabel>
          <Input id="movement-performer" readOnly value={performer} />
        </Field>
        <Field>
          <FieldLabel htmlFor="movement-remark">Remark</FieldLabel>
          <Input id="movement-remark" name="remark" />
        </Field>
      </FieldGroup>
      <Button className="w-fit" type="submit">
        Record Movement
      </Button>
    </form>
  )
}
