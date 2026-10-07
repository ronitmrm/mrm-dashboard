"use client"

import { useActionState } from "react"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { NativeSelect, NativeSelectOption } from "@workspace/ui/components/native-select"

import { recordDepartmentAssetLossAction } from "@/app/department-store/actions"
import { FormGrid, FormSection } from "@/components/ui/golden-patterns"

type Unit = {
  assetCode: string
  holderName: string | null
  holderType: string
  status: string
}

export function StoreStockLossForm({ units }: {
  units: Unit[]
}) {
  const [state, action, pending] = useActionState(
    recordDepartmentAssetLossAction,
    { error: null }
  )
  const available = units.filter((unit) => unit.status !== "SCRAPPED" && unit.status !== "LOST")

  return (
    <FormSection
      title="Record Unit ID loss"
      description="Select one lost Non Consumable Unit ID. Company on-hand falls by one."
      width="wide"
    >
      <form action={action} className="grid gap-4">
        <input name="store_code" type="hidden" value="MAIN" />
        <FormGrid>
          <label className="grid gap-1.5 text-sm font-medium">
            <span>Unit ID</span>
            <NativeSelect name="asset_code" required>
              <NativeSelectOption value="">Select Unit ID</NativeSelectOption>
              {available.map((unit) => (
                <NativeSelectOption key={unit.assetCode} value={unit.assetCode}>
                  {unit.assetCode} · {unit.holderName || unit.holderType}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            <span>Loss details</span>
            <Input name="remark" required />
          </label>
        </FormGrid>
        {state.error ? <p className="text-sm text-destructive" role="alert">{state.error}</p> : null}
        <Button className="w-fit" disabled={pending || !available.length} type="submit">
          {pending ? "Saving…" : "Record Loss"}
        </Button>
      </form>
    </FormSection>
  )
}
