"use client"

import { useActionState } from "react"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { NativeSelect, NativeSelectOption } from "@workspace/ui/components/native-select"

import { adjustDepartmentQuantityAction } from "@/app/department-store/actions"
import { FormGrid, FormSection } from "@/components/ui/golden-patterns"

type Consumable = {
  assetName: string
  availableStock: string
  id: string
  typeCode: string
  unit: string
}

export function StoreStockAdjustmentForm({ consumables }: {
  consumables: Consumable[]
}) {
  const [state, action, pending] = useActionState(
    adjustDepartmentQuantityAction,
    { error: null }
  )
  const available = consumables.filter((item) => Number(item.availableStock) > 0)

  return (
    <FormSection
      title="Record loss or damage"
      description="Adjust Main Store consumable stock. This reduces company on-hand and records the reason."
      width="wide"
    >
      <form action={action} className="grid gap-4">
        <input name="store_code" type="hidden" value="MAIN" />
        <FormGrid>
          <label className="grid gap-1.5 text-sm font-medium">
            <span>Consumable Asset Code</span>
            <NativeSelect name="item_type_id" required>
              <NativeSelectOption value="">Select an available item</NativeSelectOption>
              {available.map((item) => (
                <NativeSelectOption key={item.id} value={item.id}>
                  {item.typeCode} · {item.assetName} · available {item.availableStock} {item.unit}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            <span>Reason</span>
            <NativeSelect name="reason" required>
              <NativeSelectOption value="">Select reason</NativeSelectOption>
              <NativeSelectOption value="LOSS">Loss</NativeSelectOption>
              <NativeSelectOption value="DAMAGE">Damage</NativeSelectOption>
            </NativeSelect>
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            <span>Quantity</span>
            <Input min="0.001" name="quantity" required step="0.001" type="number" />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            <span>Details</span>
            <Input name="remark" required />
          </label>
        </FormGrid>
        {state.error ? <p className="text-sm text-destructive" role="alert">{state.error}</p> : null}
        <Button className="w-fit" disabled={pending || !available.length} type="submit">
          {pending ? "Saving…" : "Record Adjustment"}
        </Button>
      </form>
    </FormSection>
  )
}
