"use client"

import type { createStoreRepository } from "@workspace/db"
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@workspace/ui/components/field"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"

export type StoreStorageLocations = Awaited<
  ReturnType<ReturnType<typeof createStoreRepository>["listStorageLocations"]>
>

export function StoreStorageLocationField({
  id,
  itemTypeId,
  label = "Storage Location",
  name = "destination_location_id",
  storage,
  storeCode,
  compact = false,
  onValueChange,
  value,
}: {
  id: string
  itemTypeId: string
  label?: string
  name?: string
  storage: StoreStorageLocations
  storeCode: string
  compact?: boolean
  onValueChange?: (value: string) => void
  value?: string
}) {
  const locations = storage.locations.filter(
    (location) => location.storeCode.toLowerCase() === storeCode.toLowerCase()
  )
  const existing = storage.defaults.find(
    (entry) =>
      entry.itemTypeId === itemTypeId &&
      entry.storeCode.toLowerCase() === storeCode.toLowerCase()
  )
  const defaultId =
    existing?.locationId ??
    locations.find((location) => location.isDefault)?.id ??
    ""

  return (
    <Field>
      <FieldLabel className={compact ? "sr-only" : undefined} htmlFor={id}>
        {label}
      </FieldLabel>
      <NativeSelect
        defaultValue={onValueChange ? undefined : defaultId}
        id={id}
        key={`${storeCode}-${itemTypeId}-${defaultId}`}
        name={name}
        onValueChange={onValueChange}
        required
        value={onValueChange ? (value ?? defaultId) : undefined}
      >
        <NativeSelectOption disabled value="">
          Select storage location
        </NativeSelectOption>
        {locations.map((location) => (
          <NativeSelectOption key={location.id} value={location.id}>
            {location.code} · {location.name}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      {!compact ? (
        <FieldDescription>
          {existing
            ? "Existing item location selected. Change it for this receipt if needed."
            : "Choose where this item will be stored in the receiving Store."}
        </FieldDescription>
      ) : null}
    </Field>
  )
}
