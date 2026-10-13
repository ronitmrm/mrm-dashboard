"use client"

import { useActionState } from "react"
import { Button } from "@workspace/ui/components/button"
import { Field, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import { StandardState } from "@workspace/ui/components/standard-state"
import {
  OperationalTable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import { transferStockResponsibilityAction } from "@/app/department-store/actions"
import { FormGrid, FormSection } from "@/components/ui/golden-patterns"

export type StockTransferItem = {
  code: string
  name: string
  unit: string
} & ({ assetCode: string } | { itemTypeId: string; availableQuantity: string })

export function StoreStockTransferForm({
  items,
  stores,
}: {
  items: StockTransferItem[]
  stores: Array<{ code: string; name: string }>
}) {
  const [state, action, pending] = useActionState(
    transferStockResponsibilityAction,
    { error: null }
  )
  return (
    <FormSection
      title="Transfer responsibility"
      description="Move selected stock to one receiving Store. That Store sets its own storage location. Unit IDs at a machine or department stay there."
      width="full"
    >
      <form action={action} className="grid gap-4">
        <input name="store_code" type="hidden" value="MAIN" />
        <FormGrid className="max-w-2xl">
          <Field>
            <FieldLabel htmlFor="stock-transfer-store">
              Receiving Store
            </FieldLabel>
            <NativeSelect
              id="stock-transfer-store"
              name="destination_store_code"
              required
            >
              <NativeSelectOption value="">Select Store</NativeSelectOption>
              {stores.map((store) => (
                <NativeSelectOption key={store.code} value={store.code}>
                  {store.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor="stock-transfer-remark">Remark</FieldLabel>
            <Input id="stock-transfer-remark" name="remark" />
          </Field>
        </FormGrid>
        <OperationalTable filterStorageKey="store-stock-transfer-review">
          <TableHeader>
            <TableRow>
              <TableHead>Asset Code / Unit ID</TableHead>
              <TableHead>Asset Name</TableHead>
              <TableHead>Quantity to transfer</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.code}>
                <TableCell>{item.code}</TableCell>
                <TableCell>{item.name}</TableCell>
                <TableCell>
                  {"assetCode" in item ? (
                    <>
                      <input
                        name="asset_code"
                        type="hidden"
                        value={item.assetCode}
                      />
                      1 {item.unit}
                    </>
                  ) : (
                    <>
                      <input
                        name="item_type_id"
                        type="hidden"
                        value={item.itemTypeId}
                      />
                      <Input
                        aria-label={`Quantity to transfer for ${item.code}`}
                        name={`quantity_${item.itemTypeId}`}
                        min="0.001"
                        max={item.availableQuantity}
                        step="0.001"
                        type="number"
                        required
                      />
                      <span className="text-xs text-muted-foreground">
                        Available {item.availableQuantity} {item.unit}
                      </span>
                    </>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </OperationalTable>
        {state.error ? (
          <StandardState
            variant="error"
            title="Transfer could not be saved"
            description={state.error}
          />
        ) : null}
        <Button
          className="w-fit"
          disabled={pending || !items.length}
          type="submit"
        >
          {pending ? "Saving…" : `Transfer ${items.length} selected items`}
        </Button>
      </form>
    </FormSection>
  )
}
