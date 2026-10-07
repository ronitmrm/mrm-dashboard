"use client"

import { useActionState } from "react"
import { Button } from "@workspace/ui/components/button"

import { completeDepartmentRepairOrderAction } from "@/app/department-store/actions"

export function DepartmentRepairCompletion({ assetCode, purchaseOrderId, storeCode }: {
  assetCode: string
  purchaseOrderId: string
  storeCode: string
}) {
  const [state, dispatch, pending] = useActionState(completeDepartmentRepairOrderAction, { error: null })
  return <form action={dispatch} className="grid gap-1.5">
    <input name="store_code" type="hidden" value={storeCode} />
    <input name="asset_code" type="hidden" value={assetCode} />
    <input name="purchase_order_id" type="hidden" value={purchaseOrderId} />
    <Button disabled={pending} size="sm" type="submit" variant="outline">
      {pending ? "Saving…" : "Record Return"}
    </Button>
    {state.error ? <span className="text-xs text-destructive" role="alert">{state.error}</span> : null}
  </form>
}
