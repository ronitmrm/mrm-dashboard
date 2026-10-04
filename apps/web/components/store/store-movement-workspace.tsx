"use client"

import { useActionState, useState } from "react"

import { Button } from "@workspace/ui/components/button"
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { NativeSelect, NativeSelectOption } from "@workspace/ui/components/native-select"

import {
  transferDepartmentAssetAction,
  transferDepartmentQuantityAction,
  type DepartmentStoreActionState,
} from "@/app/department-store/actions"
import { FormSection } from "@/components/ui/golden-patterns"
import { StoreMovementForm } from "./store-movement-form"

type MovementUnit = React.ComponentProps<typeof StoreMovementForm>["units"][number]
type Store = { code: string; id: string; name: string }

function TransferForm({ action, children, label }: {
  action: (state: DepartmentStoreActionState, formData: FormData) => Promise<DepartmentStoreActionState>
  children: React.ReactNode
  label: string
}) {
  const [state, dispatch, pending] = useActionState(action, { error: null })
  return (
    <form action={dispatch} className="grid gap-4">
      <input name="store_code" type="hidden" value="MAIN" />
      <FieldGroup className="gap-4">{children}</FieldGroup>
      {state.error ? <p className="text-sm text-destructive" role="alert">{state.error}</p> : null}
      <Button className="w-fit" disabled={pending} type="submit">
        {pending ? "Saving…" : label}
      </Button>
    </form>
  )
}

export function StoreMovementWorkspace({
  assets,
  canTransfer,
  consumables,
  departments,
  initialUnitId,
  locations,
  machines,
  performer,
  stores,
  units,
  vendors,
}: {
  assets: { assetCode: string; assetName: string; status: string }[]
  canTransfer: boolean
  consumables: {
    assetName: string
    availableQuantity: string
    itemTypeId: string
    typeCode: string
    unit: string
  }[]
  departments: React.ComponentProps<typeof StoreMovementForm>["departments"]
  initialUnitId: string
  locations: React.ComponentProps<typeof StoreMovementForm>["locations"]
  machines: React.ComponentProps<typeof StoreMovementForm>["machines"]
  performer: string
  stores: Store[]
  units: MovementUnit[]
  vendors: React.ComponentProps<typeof StoreMovementForm>["vendors"]
}) {
  const [action, setAction] = useState<"PHYSICAL" | "QUANTITY" | "ACCOUNTABILITY">("PHYSICAL")
  const otherStores = stores.filter((store) => store.code !== "MAIN")

  return (
    <FormSection
      description="Choose what is moving. Physical movement changes where a Unit ID is held; a Store transfer changes which Store is responsible."
      title="Record Movement"
      width="standard"
    >
      <Field>
        <FieldLabel htmlFor="movement-action">Movement type</FieldLabel>
        <NativeSelect
          id="movement-action"
          onValueChange={(value) => setAction(value as typeof action)}
          value={action}
        >
          <NativeSelectOption value="PHYSICAL">Move Unit ID physically</NativeSelectOption>
          {canTransfer ? <NativeSelectOption value="QUANTITY">Transfer consumable quantity to another Store</NativeSelectOption> : null}
          {canTransfer ? <NativeSelectOption value="ACCOUNTABILITY">Transfer Unit ID responsibility to another Store</NativeSelectOption> : null}
        </NativeSelect>
      </Field>

      {action === "PHYSICAL" ? (
        <StoreMovementForm
          departments={departments}
          initialUnitId={initialUnitId}
          locations={locations}
          machines={machines}
          performer={performer}
          units={units}
          vendors={vendors}
        />
      ) : null}

      {canTransfer && action === "QUANTITY" ? (
        <TransferForm action={transferDepartmentQuantityAction} label="Transfer Quantity">
          <Field>
            <FieldLabel htmlFor="quantity-item">Consumable Asset Code</FieldLabel>
            <NativeSelect id="quantity-item" name="item_type_id" required>
              <NativeSelectOption value="">Select an available item</NativeSelectOption>
              {consumables.filter((item) => Number(item.availableQuantity) > 0).map((item) => (
                <NativeSelectOption key={item.itemTypeId} value={item.itemTypeId}>
                  {item.typeCode} — {item.assetName} · available {item.availableQuantity} {item.unit}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor="quantity-destination">Receiving Store</FieldLabel>
            <NativeSelect id="quantity-destination" name="destination_store_code" required>
              <NativeSelectOption value="">Select Store</NativeSelectOption>
              {otherStores.map((store) => (
                <NativeSelectOption key={store.id} value={store.code}>{store.name}</NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor="quantity-amount">Quantity</FieldLabel>
            <Input id="quantity-amount" min="0.001" name="quantity" required step="0.001" type="number" />
          </Field>
          <Field>
            <FieldLabel htmlFor="quantity-remark">Remark</FieldLabel>
            <Input id="quantity-remark" name="remark" />
          </Field>
        </TransferForm>
      ) : null}

      {canTransfer && action === "ACCOUNTABILITY" ? (
        <TransferForm action={transferDepartmentAssetAction} label="Transfer Responsibility">
          <Field>
            <FieldLabel htmlFor="accountability-unit">Unit ID</FieldLabel>
            <NativeSelect id="accountability-unit" name="asset_code" required>
              <NativeSelectOption value="">Select Unit ID</NativeSelectOption>
              {assets.filter((asset) => asset.status !== "SCRAPPED" && asset.status !== "LOST").map((asset) => (
                <NativeSelectOption key={asset.assetCode} value={asset.assetCode}>
                  {asset.assetCode} — {asset.assetName}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor="accountability-destination">Receiving Store</FieldLabel>
            <NativeSelect id="accountability-destination" name="destination_store_code" required>
              <NativeSelectOption value="">Select Store</NativeSelectOption>
              {otherStores.map((store) => (
                <NativeSelectOption key={store.id} value={store.code}>{store.name}</NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor="accountability-remark">Reason / handover note</FieldLabel>
            <Input id="accountability-remark" name="remark" />
          </Field>
        </TransferForm>
      ) : null}
    </FormSection>
  )
}
