"use client"

import { useActionState } from "react"
import type { createDepartmentStoreRepository } from "@workspace/db"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { NativeSelect, NativeSelectOption } from "@workspace/ui/components/native-select"

import { createDepartmentRepairOrderAction } from "@/app/department-store/actions"
import { FormGrid, FormSection } from "@/components/ui/golden-patterns"

type Workspace = Awaited<ReturnType<ReturnType<typeof createDepartmentStoreRepository>["listStoreWorkspace"]>>

export function DepartmentRepairOrderForm({ issuanceId, selected, storeCode, suppliers }: {
  issuanceId: string
  selected: Workspace["assets"]
  storeCode: string
  suppliers: Array<{ id: string; code: string; name: string }>
}) {
  const [state, dispatch, pending] = useActionState(createDepartmentRepairOrderAction, { error: null })
  return <FormSection
    description="Select the repair supplier, scope, and agreed price for each Unit ID. One PO is issued per supplier."
    title="Repair service details"
    width="full"
  >
    <form action={dispatch} className="grid gap-5">
      <input type="hidden" name="store_code" value={storeCode} />
      <input type="hidden" name="issuance_id" value={issuanceId} />
      {selected.map((asset) => <div className="grid gap-3 border-b pb-5 last:border-0 last:pb-0" key={asset.assetCode}>
        <input type="hidden" name="asset_code" value={asset.assetCode} />
        <div className="text-sm font-semibold">{asset.assetCode} · {asset.assetName}</div>
        <p className="text-xs text-muted-foreground">Current holder: {asset.holderName || asset.holderType}</p>
        <FormGrid className="xl:grid-cols-3">
          <label className="grid gap-1.5 text-sm font-medium">
            <span>Repair supplier</span>
            <NativeSelect className="w-full" name={`supplier_${asset.assetCode}`} required>
              <NativeSelectOption value="">Select supplier</NativeSelectOption>
              {suppliers.map((supplier) => <NativeSelectOption key={supplier.id} value={supplier.id}>
                {supplier.code} · {supplier.name}
              </NativeSelectOption>)}
            </NativeSelect>
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            <span>Repair scope</span>
            <Input name={`service_description_${asset.assetCode}`} required />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            <span>Agreed price</span>
            <Input min="0" name={`service_price_${asset.assetCode}`} required step="0.01" type="number" />
          </label>
        </FormGrid>
      </div>)}
      <FormGrid className="xl:grid-cols-2">
        <label className="grid gap-1.5 text-sm font-medium">
          <span>Order date</span><Input name="order_date" type="date" />
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          <span>Order remark</span><Input name="remark" />
        </label>
      </FormGrid>
      {state.error ? <p role="alert" className="text-sm text-destructive">{state.error}</p> : null}
      <Button className="w-fit" disabled={pending} type="submit">
        {pending ? "Issuing…" : "Issue Repair PO"}
      </Button>
    </form>
  </FormSection>
}
