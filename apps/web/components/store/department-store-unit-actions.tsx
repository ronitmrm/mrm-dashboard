"use client"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@workspace/ui/components/button"
import { Field, FieldLabel } from "@workspace/ui/components/field"
import { NativeSelect, NativeSelectOption } from "@workspace/ui/components/native-select"

export function DepartmentStoreUnitActions({ assets, canRepair, storeCode }: {
  assets: Array<{ assetCode: string; assetName: string; status: string }>
  canRepair: boolean
  storeCode: string
}) {
  const [unitId, setUnitId] = useState("")
  const selected = assets.find((asset) => asset.assetCode === unitId)
  const store = encodeURIComponent(storeCode)
  const unit = encodeURIComponent(unitId)
  return <div className="flex flex-wrap items-end gap-2">
    <Field className="w-64 max-w-full">
      <FieldLabel htmlFor="store-action-unit">Unit ID for service or history</FieldLabel>
      <NativeSelect className="w-full" id="store-action-unit" value={unitId} onValueChange={setUnitId}
        searchPlaceholder="Search Unit ID or item">
        <NativeSelectOption value="">Select Unit ID</NativeSelectOption>
        {assets.map((asset) => <NativeSelectOption key={asset.assetCode} value={asset.assetCode}>
          {asset.assetCode} · {asset.assetName}
        </NativeSelectOption>)}
      </NativeSelect>
    </Field>
    {selected ? <Button asChild size="sm" variant="outline"><Link
      href={`/department-store/assets/${unit}?store=${store}`}>History</Link></Button>
      : <Button disabled size="sm" variant="outline">History</Button>}
    {canRepair ? <>
      {selected && selected.status !== "SCRAPPED" ? <>
        <Button asChild size="sm" variant="outline"><Link
          href={`/department-store/repair?store=${store}&asset_code=${unit}`}>Repair PO</Link></Button>
        <Button asChild size="sm" variant="outline"><Link
          href={`/department-store/calibration/${unit}?store=${store}`}>Calibration service</Link></Button>
      </> : <>
        <Button disabled size="sm" variant="outline">Repair PO</Button>
        <Button disabled size="sm" variant="outline">Calibration service</Button>
      </>}
    </> : null}
  </div>
}
