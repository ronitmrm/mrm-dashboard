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
  holderReference: string | null
  holderType: string
  locationName: string | null
  status: string
}

type MovementDestination = "DEPARTMENT" | "MACHINE" | "STORE" | "VENDOR"

export function StoreMovementForm({
  departments,
  initialUnitId,
  locations,
  machines,
  performer,
  units,
  vendors,
}: {
  departments: { code: string; name: string }[]
  initialUnitId: string
  locations: { code: string; name: string }[]
  machines: { machineNumber: string; name: string | null }[]
  performer: string
  units: MovementUnit[]
  vendors: { code: string; id: string; name: string }[]
}) {
  const [destination, setDestination] = useState<MovementDestination>("VENDOR")
  const [selectedUnitId, setSelectedUnitId] = useState(initialUnitId)
  const selectedUnit = units.find((unit) => unit.assetCode === selectedUnitId)
  const currentLocation = selectedUnit
    ? selectedUnit.holderType === "STORE"
      ? (selectedUnit.locationName ??
        selectedUnit.holderName ??
        selectedUnit.holderReference ??
        "Store")
      : `${selectedUnit.holderType.charAt(0)}${selectedUnit.holderType.slice(1).toLowerCase()} — ${selectedUnit.holderName ?? selectedUnit.holderReference ?? "Unknown"}`
    : null

  return (
    <form action={moveStoreAssetAction} className="grid gap-4">
      <FieldGroup className="gap-4">
        <Field>
          <FieldLabel htmlFor="movement-unit">Unit ID</FieldLabel>
          <NativeSelect
            id="movement-unit"
            name="asset_code"
            onValueChange={setSelectedUnitId}
            required
            value={selectedUnitId}
          >
            <NativeSelectOption value="">Select Unit ID</NativeSelectOption>
            {units.map((unit) => (
              <NativeSelectOption key={unit.assetCode} value={unit.assetCode}>
                {unit.assetCode} — {unit.assetName} ·{" "}
                {unit.holderName ?? unit.status}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        {selectedUnit ? (
          <dl className="grid gap-3 rounded-md border bg-muted/30 p-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground">Available Quantity</dt>
              <dd className="font-medium">
                {selectedUnit.status === "AVAILABLE" &&
                selectedUnit.holderType === "STORE"
                  ? 1
                  : 0}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Allocated Quantity</dt>
              <dd className="font-medium">
                {selectedUnit.status === "ASSIGNED" ? 1 : 0}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Current Location</dt>
              <dd className="font-medium">{currentLocation}</dd>
            </div>
          </dl>
        ) : null}
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
            <NativeSelectOption value="DEPARTMENT">
              Department
            </NativeSelectOption>
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
              <NativeSelectOption value="">
                Select Store Location
              </NativeSelectOption>
              {locations.map((location) => (
                <NativeSelectOption key={location.code} value={location.code}>
                  {location.code} — {location.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
        ) : (
          <Field>
            <FieldLabel htmlFor="movement-reference">
              {destination === "MACHINE" ? "Machine" : "Department"}
            </FieldLabel>
            <NativeSelect
              id="movement-reference"
              name="holder_reference"
              required
            >
              <NativeSelectOption value="">
                {destination === "MACHINE"
                  ? "Select Machine"
                  : "Select Department"}
              </NativeSelectOption>
              {destination === "MACHINE"
                ? machines.map((machine) => (
                    <NativeSelectOption
                      key={machine.machineNumber}
                      value={machine.machineNumber}
                    >
                      {machine.machineNumber}
                      {machine.name ? ` — ${machine.name}` : ""}
                    </NativeSelectOption>
                  ))
                : departments.map((department) => (
                    <NativeSelectOption
                      key={department.code}
                      value={department.code}
                    >
                      {department.code} — {department.name}
                    </NativeSelectOption>
                  ))}
            </NativeSelect>
          </Field>
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
