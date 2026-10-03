"use client"

import { useState } from "react"

import { isWarrantyDayCount, warrantyEndDate } from "@workspace/db/store-warranty"
import { Button } from "@workspace/ui/components/button"
import { Field, FieldDescription, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { SearchableSelect } from "@workspace/ui/components/searchable-select"

import { MasterEntryForm } from "../master-entry-form"

type EquipmentUnit = {
  assetName: string
  status: string
  typeCode: string
  unitId: string
}

export function StoreUnitDetailsForm({
  action,
  asset,
  equipmentUnits,
}: {
  action: (formData: FormData) => Promise<unknown>
  asset: {
    assetCode: string
    installedOn: string | null
    manufacturerSerialNumber: string | null
    mcbNumber: string | null
    stabilizerUnitId: string | null
    warrantyPeriod: string | null
    warrantyUntil: string | null
  }
  equipmentUnits: EquipmentUnit[]
}) {
  const [installedOn, setInstalledOn] = useState(asset.installedOn ?? "")
  const [period, setPeriod] = useState(
    isWarrantyDayCount(asset.warrantyPeriod) ? asset.warrantyPeriod.trim() : ""
  )
  const days = isWarrantyDayCount(period) ? Number(period) : null
  const calculatedEnd = days && Number.isSafeInteger(days)
    ? warrantyEndDate(installedOn, days)
    : null
  const historicalEnd = asset.warrantyUntil &&
    (!asset.installedOn || !isWarrantyDayCount(asset.warrantyPeriod))
    ? asset.warrantyUntil
    : null
  const displayedEnd = calculatedEnd ?? historicalEnd ?? ""
  const options = equipmentUnits.filter((unit) => unit.unitId !== asset.assetCode)

  return (
    <MasterEntryForm action={action} className="grid gap-4 sm:grid-cols-2">
      <input name="asset_code" type="hidden" value={asset.assetCode} />
      <Field>
        <FieldLabel htmlFor="asset-manufacturer_serial_number">Manufacturer Serial Number</FieldLabel>
        <Input
          defaultValue={asset.manufacturerSerialNumber ?? ""}
          id="asset-manufacturer_serial_number"
          name="manufacturer_serial_number"
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="asset-warranty_period">Warranty Period (days)</FieldLabel>
        <Input
          id="asset-warranty_period"
          min="1"
          name="warranty_period"
          onChange={(event) => setPeriod(event.target.value)}
          step="1"
          type="number"
          value={period}
        />
        {asset.warrantyPeriod && !isWarrantyDayCount(asset.warrantyPeriod) ? (
          <FieldDescription>Previously recorded: {asset.warrantyPeriod}</FieldDescription>
        ) : null}
      </Field>
      <Field>
        <FieldLabel htmlFor="asset-warranty_until">Warranty End</FieldLabel>
        <Input id="asset-warranty_until" readOnly type="date" value={displayedEnd} />
        {!calculatedEnd && historicalEnd ? (
          <FieldDescription>
            Previous end date. Enter an installation date and period in days to recalculate it.
          </FieldDescription>
        ) : null}
      </Field>
      <Field>
        <FieldLabel htmlFor="asset-installed_on">Installation Date</FieldLabel>
        <Input
          id="asset-installed_on"
          name="installed_on"
          onChange={(event) => setInstalledOn(event.target.value)}
          type="date"
          value={installedOn}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="asset-stabilizer_unit_id">Connected Stabiliser Unit ID</FieldLabel>
        <SearchableSelect
          defaultValue={asset.stabilizerUnitId ?? ""}
          id="asset-stabilizer_unit_id"
          name="stabilizer_unit_id"
          searchPlaceholder="Search Asset Code, name or Unit ID"
          wrapLabels
        >
          <option value="">None</option>
          {asset.stabilizerUnitId && !options.some((unit) => unit.unitId === asset.stabilizerUnitId) ? (
            <option value={asset.stabilizerUnitId}>{asset.stabilizerUnitId} · Previously recorded</option>
          ) : null}
          {options.map((unit) => (
            <option key={unit.unitId} value={unit.unitId}>
              {unit.typeCode} · {unit.assetName} · {unit.unitId} · {unit.status}
            </option>
          ))}
        </SearchableSelect>
      </Field>
      <Field>
        <FieldLabel htmlFor="asset-mcb_number">Connected MCB Unit ID</FieldLabel>
        <SearchableSelect
          defaultValue={asset.mcbNumber ?? ""}
          id="asset-mcb_number"
          name="mcb_number"
          searchPlaceholder="Search Asset Code, name or Unit ID"
          wrapLabels
        >
          <option value="">None</option>
          {asset.mcbNumber && !options.some((unit) => unit.unitId === asset.mcbNumber) ? (
            <option value={asset.mcbNumber}>{asset.mcbNumber} · Previously recorded</option>
          ) : null}
          {options.map((unit) => (
            <option key={unit.unitId} value={unit.unitId}>
              {unit.typeCode} · {unit.assetName} · {unit.unitId} · {unit.status}
            </option>
          ))}
        </SearchableSelect>
      </Field>
      <div className="sm:col-span-2">
        <Button type="submit">Save Unit Details</Button>
      </div>
    </MasterEntryForm>
  )
}
