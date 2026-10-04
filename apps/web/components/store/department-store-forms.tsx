"use client"

import { useActionState, useState, type ReactNode } from "react"
import type { createDepartmentStoreRepository } from "@workspace/db"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { NativeSelect, NativeSelectOption } from "@workspace/ui/components/native-select"

import {
  consumeDepartmentQuantityAction,
  createQualityGaugeSetAction,
  disbandQualityGaugeSetAction,
  moveDepartmentAssetAction,
  moveQualityGaugeSetAction,
  recordDepartmentAssetLossAction,
  replaceQualityGaugeSetMemberAction,
  transferDepartmentAssetAction,
  transferDepartmentQuantityAction,
  type DepartmentStoreActionState,
} from "@/app/department-store/actions"
import { FormGrid, FormSection } from "@/components/ui/golden-patterns"

type Workspace = Awaited<ReturnType<ReturnType<typeof createDepartmentStoreRepository>["listStoreWorkspace"]>>
type StoreAction = (
  state: DepartmentStoreActionState,
  formData: FormData
) => Promise<DepartmentStoreActionState>

function ActionForm({ action, children, disabled = false, storeCode, submitLabel }: {
  action: StoreAction
  children: ReactNode
  disabled?: boolean
  storeCode: string
  submitLabel: string
}) {
  const [state, dispatch, pending] = useActionState(action, { error: null })
  return (
    <form action={dispatch} className="grid gap-4">
      <input type="hidden" name="store_code" value={storeCode} />
      {children}
      {state.error ? <p role="alert" className="text-sm text-destructive">{state.error}</p> : null}
      <Button className="w-fit" disabled={pending || disabled} type="submit">
        {pending ? "Saving…" : submitLabel}
      </Button>
    </form>
  )
}

function TextField({ label, name, ...props }: React.ComponentProps<typeof Input> & {
  label: string
  name: string
}) {
  return <label className="grid gap-1.5 text-sm font-medium">
    <span>{label}</span><Input name={name} {...props} />
  </label>
}

function SelectField({ children, label, name, ...props }: React.ComponentProps<typeof NativeSelect> & {
  label: string
  name: string
}) {
  return <label className="grid gap-1.5 text-sm font-medium">
    <span>{label}</span><NativeSelect className="w-full" name={name} {...props}>{children}</NativeSelect>
  </label>
}

function DestinationFields({
  departments,
  machines,
  store,
  vendors,
}: {
  departments: Array<{ code: string; id: string; name: string }>
  machines: Array<{ id: string; machineNumber: string; name: string | null }>
  store: Workspace["store"]
  vendors: Array<{ code: string; id: string; name: string }>
}) {
  const [holderType, setHolderType] = useState<"STORE" | "DEPARTMENT" | "MACHINE" | "VENDOR">("STORE")
  const [holderReference, setHolderReference] = useState(store.defaultLocationId)
  return <>
    <SelectField label="Physical destination" name="holder_type" required value={holderType}
      onValueChange={(value) => {
        setHolderType(value as typeof holderType)
        setHolderReference(value === "STORE" ? store.defaultLocationId : "")
      }}>
      <NativeSelectOption value="STORE">Return to this Store</NativeSelectOption>
      <NativeSelectOption value="DEPARTMENT">Department use</NativeSelectOption>
      <NativeSelectOption value="MACHINE">Machine use</NativeSelectOption>
      <NativeSelectOption value="VENDOR">Vendor</NativeSelectOption>
    </SelectField>
    <SelectField label="Destination" name="holder_reference" required value={holderReference}
      onValueChange={setHolderReference}>
      {holderType === "STORE" ? <NativeSelectOption value={store.defaultLocationId}>{store.name}</NativeSelectOption> : null}
      {holderType !== "STORE" ? <NativeSelectOption value="">Select destination</NativeSelectOption> : null}
      {holderType === "DEPARTMENT" ? departments.map((department) =>
        <NativeSelectOption key={department.code} value={department.code}>{department.code} · {department.name}</NativeSelectOption>) : null}
      {holderType === "MACHINE" ? machines.map((machine) =>
        <NativeSelectOption key={machine.id} value={machine.id}>{machine.machineNumber} · {machine.name || machine.machineNumber}</NativeSelectOption>) : null}
      {holderType === "VENDOR" ? vendors.map((vendor) =>
        <NativeSelectOption key={vendor.id} value={vendor.id}>{vendor.code} · {vendor.name}</NativeSelectOption>) : null}
    </SelectField>
    <input name="vendor_id" type="hidden" value={holderType === "VENDOR" ? holderReference : ""} />
  </>
}

export type DepartmentStoreAction = "quantity" | "accountability" | "physical" | "consume" | "adjust" | "gauge-create" | "gauge-move" | "gauge-replace" | "gauge-disband"

export function DepartmentStoreForms({ action, assets, consumables, departments, gaugeSets, machines, recorderId, selectedItemIds = [], store, stores, today, vendors }: {
  action: DepartmentStoreAction
  assets: Workspace["assets"]
  consumables: Workspace["consumables"]
  departments: Array<{ code: string; id: string; name: string }>
  gaugeSets: Workspace["gaugeSets"]
  machines: Array<{ id: string; machineNumber: string; name: string | null }>
  recorderId: string
  selectedItemIds?: string[]
  store: Workspace["store"]
  stores: Workspace["stores"]
  today: string
  vendors: Array<{ code: string; id: string; name: string }>
}) {
  const availableConsumables = consumables.filter((item) => Number(item.availableQuantity) > 0)
  const movableAssets = assets.filter((asset) => asset.status !== "SCRAPPED" && asset.status !== "LOST")
  const availableGauges = assets.filter((asset) =>
    asset.isGauge && !asset.inGaugeSet && asset.status === "AVAILABLE" && asset.holderType === "STORE"
  )
  const otherStores = stores.filter((destination) => destination.id !== store.id &&
    (store.kind === "MAIN" || destination.kind === "MAIN"))
  const selectedConsumables = consumables.filter((item) =>
    selectedItemIds.includes(item.itemTypeId) && Number(item.availableQuantity) > 0
  )
  const [replacementSetId, setReplacementSetId] = useState("")
  const [transferMode, setTransferMode] = useState<"quantity" | "physical">(
    action === "physical" ? "physical" : "quantity"
  )
  const replacementSet = gaugeSets.find((set) => set.id === replacementSetId)
  return <div className="grid gap-5">
    {action === "quantity" || action === "physical" ? <FormSection title="Transfer or move stock"
      description="Transfer Consumable quantity to another Store, or move one Unit ID to a physical holder."
      width="wide">
      <SelectField label="Stock to move" name="stock_type" value={transferMode}
        onValueChange={(value) => setTransferMode(value as typeof transferMode)}>
        <NativeSelectOption value="quantity">Consumable quantity to another Store</NativeSelectOption>
        <NativeSelectOption value="physical">Non Consumable Unit ID to a physical holder</NativeSelectOption>
      </SelectField>
      {transferMode === "quantity" ? <ActionForm action={transferDepartmentQuantityAction} storeCode={store.code} submitLabel="Transfer Quantity">
        <FormGrid className="xl:grid-cols-2">
          <SelectField label="Consumable Asset Code" name="item_type_id" required>
            <NativeSelectOption value="">Select an available item</NativeSelectOption>
            {availableConsumables.map((item) => <NativeSelectOption key={item.itemTypeId} value={item.itemTypeId}>
              {item.typeCode} · {item.assetName} · available {item.availableQuantity} {item.unit}
            </NativeSelectOption>)}
          </SelectField>
          <SelectField label={store.kind === "MAIN" ? "Receiving Store" : "Receiving Main Store"} name="destination_store_code" required>
            <NativeSelectOption value="">Select Store</NativeSelectOption>
            {otherStores.map((destination) => <NativeSelectOption key={destination.id} value={destination.code}>
              {destination.name}
            </NativeSelectOption>)}
          </SelectField>
          <TextField label="Quantity" name="quantity" min="0.001" step="0.001" type="number" required />
          <TextField label="Remark" name="remark" />
        </FormGrid>
      </ActionForm> : <ActionForm action={moveDepartmentAssetAction} storeCode={store.code} submitLabel="Record Movement">
        <FormGrid className="xl:grid-cols-2">
          <SelectField label="Unit ID" name="asset_code" required>
            <NativeSelectOption value="">Select Unit ID</NativeSelectOption>
            {movableAssets.map((asset) => <NativeSelectOption key={asset.assetCode} value={asset.assetCode}>
              {asset.assetCode} · {asset.assetName} · {asset.holderName || asset.holderType}
            </NativeSelectOption>)}
          </SelectField>
          <DestinationFields departments={departments} machines={machines} store={store} vendors={vendors} />
          <TextField label="Movement note" name="remark" />
        </FormGrid>
      </ActionForm>}
    </FormSection> : null}

    {action === "accountability" ? <FormSection title="Transfer Unit ID accountability"
      description="If the Unit ID is in this Store, it also moves physically to the receiving Store. A machine or department keeps holding it when only responsibility changes."
      width="wide">
      <ActionForm action={transferDepartmentAssetAction} storeCode={store.code} submitLabel="Transfer Accountability">
        <FormGrid className="xl:grid-cols-2">
          <SelectField label="Unit ID" name="asset_code" required>
            <NativeSelectOption value="">Select Unit ID</NativeSelectOption>
            {movableAssets.map((asset) => <NativeSelectOption key={asset.assetCode} value={asset.assetCode}>
              {asset.assetCode} · {asset.assetName}
            </NativeSelectOption>)}
          </SelectField>
          <SelectField label={store.kind === "MAIN" ? "Receiving Store" : "Receiving Main Store"} name="destination_store_code" required>
            <NativeSelectOption value="">Select Store</NativeSelectOption>
            {otherStores.map((destination) => <NativeSelectOption key={destination.id} value={destination.code}>
              {destination.name}
            </NativeSelectOption>)}
          </SelectField>
          <TextField label="Reason / handover note" name="remark" />
        </FormGrid>
      </ActionForm>
    </FormSection> : null}

    {action === "consume" && store.kind !== "MAIN" ? <FormSection title="Record consumable use"
      description="Record only the quantity actually used. Unused stock stays available here."
      width="wide">
      <ActionForm action={consumeDepartmentQuantityAction} disabled={!selectedConsumables.length}
        storeCode={store.code} submitLabel="Record Consumption">
        <FormGrid className="xl:grid-cols-2">
          {selectedConsumables.map((item) => <div className="grid gap-2" key={item.itemTypeId}>
            <input name="item_type_id" type="hidden" value={item.itemTypeId} />
            <TextField label={`${item.typeCode} · ${item.assetName} · available ${item.availableQuantity} ${item.unit}`}
              name={`quantity_${item.itemTypeId}`} min="0.001" max={item.availableQuantity}
              step="0.001" type="number" required />
          </div>)}
          <TextField label="Operator ID" name="operator_id" value={recorderId} readOnly />
          <TextField label="Used on" name="consumed_on" type="date" defaultValue={today} max={today} required />
          <TextField label="Remark" name="remark" />
        </FormGrid>
        {!selectedConsumables.length ? <p className="text-sm text-muted-foreground">Select available consumables from Stock first.</p> : null}
      </ActionForm>
    </FormSection> : null}

    {action === "adjust" ? <FormSection title="Record Unit ID loss"
      description="Select one lost Non Consumable Unit ID. Company on-hand falls by one and its last known holder stays in history."
      width="wide">
      <ActionForm action={recordDepartmentAssetLossAction} disabled={!movableAssets.length}
        storeCode={store.code} submitLabel="Record Loss">
        <FormGrid className="xl:grid-cols-2">
          <SelectField label="Unit ID" name="asset_code" required>
            <NativeSelectOption value="">Select Unit ID</NativeSelectOption>
            {movableAssets.map((item) => <NativeSelectOption key={item.assetCode} value={item.assetCode}>
              {item.assetCode} · {item.assetName} · {item.holderName || item.holderType}
            </NativeSelectOption>)}
          </SelectField>
          <TextField label="Loss details" name="remark" required />
        </FormGrid>
      </ActionForm>
    </FormSection> : null}

    {store.kind === "QUALITY" ? <>
      {action === "gauge-create" ? <FormSection title="Combine two gauges"
        description="Give two individually identified gauges one Set ID for joint movement. Each Unit ID keeps its own calibration record."
        width="wide">
        <ActionForm action={createQualityGaugeSetAction} storeCode={store.code} submitLabel="Create Gauge Set">
          <FormGrid className="xl:grid-cols-2">
            <TextField label="Set name" name="set_name" required />
            <SelectField label="First gauge Unit ID" name="first_asset_code" required>
              <NativeSelectOption value="">Select first gauge</NativeSelectOption>
              {availableGauges.map((asset) => <NativeSelectOption key={asset.assetCode} value={asset.assetCode}>{asset.assetCode} · {asset.assetName}</NativeSelectOption>)}
            </SelectField>
            <SelectField label="Second gauge Unit ID" name="second_asset_code" required>
              <NativeSelectOption value="">Select second gauge</NativeSelectOption>
              {availableGauges.map((asset) => <NativeSelectOption key={asset.assetCode} value={asset.assetCode}>{asset.assetCode} · {asset.assetName}</NativeSelectOption>)}
            </SelectField>
          </FormGrid>
        </ActionForm>
      </FormSection> : null}
      {action === "gauge-move" ? <FormSection title="Move a gauge set"
        description="Both member Unit IDs move together. An incomplete set cannot be moved as a set."
        width="wide">
        <ActionForm action={moveQualityGaugeSetAction} storeCode={store.code} submitLabel="Move Set">
          <FormGrid className="xl:grid-cols-2">
            <SelectField label="Set ID" name="set_id" required>
              <NativeSelectOption value="">Select complete set</NativeSelectOption>
              {gaugeSets.filter((set) => set.status === "COMPLETE").map((set) =>
                <NativeSelectOption key={set.id} value={set.id}>{set.setCode} · {set.name} · {set.assetCodes.join(" + ")}</NativeSelectOption>)}
            </SelectField>
            <DestinationFields departments={departments} machines={machines} store={store} vendors={vendors} />
            <TextField label="Movement note" name="remark" />
          </FormGrid>
        </ActionForm>
      </FormSection> : null}
      {action === "gauge-replace" ? <FormSection title="Replace a gauge in a set"
        description="Keep the Set ID while replacing one member. The old and new Unit IDs retain their separate history."
        width="wide">
        <ActionForm action={replaceQualityGaugeSetMemberAction} storeCode={store.code} submitLabel="Replace Member">
          <FormGrid className="xl:grid-cols-2">
            <SelectField label="Set ID" name="set_id" required value={replacementSetId}
              onValueChange={setReplacementSetId}>
              <NativeSelectOption value="">Select set</NativeSelectOption>
              {gaugeSets.map((set) => <NativeSelectOption key={set.id} value={set.id}>
                {set.setCode} · {set.name} · {set.assetCodes.join(" + ")}
              </NativeSelectOption>)}
            </SelectField>
            <SelectField key={replacementSetId} label="Member to replace" name="old_asset_code" required>
              <NativeSelectOption value="">Select member Unit ID</NativeSelectOption>
              {(replacementSet?.assetCodes ?? []).map((assetCode) =>
                <NativeSelectOption key={assetCode} value={assetCode}>{assetCode}</NativeSelectOption>)}
            </SelectField>
            <SelectField label="New gauge Unit ID" name="new_asset_code" required>
              <NativeSelectOption value="">Select replacement</NativeSelectOption>
              {availableGauges.map((asset) =>
                <NativeSelectOption key={asset.assetCode} value={asset.assetCode}>
                  {asset.assetCode} · {asset.assetName}
                </NativeSelectOption>)}
            </SelectField>
          </FormGrid>
        </ActionForm>
      </FormSection> : null}
      {action === "gauge-disband" ? <FormSection title="Disband a gauge set"
        description="End joint movement for this set. Each gauge keeps its Unit ID and history, and can then move separately."
        width="wide">
        <ActionForm action={disbandQualityGaugeSetAction} storeCode={store.code} submitLabel="Disband Set">
          <SelectField label="Set ID" name="set_id" required>
            <NativeSelectOption value="">Select set</NativeSelectOption>
            {gaugeSets.map((set) => <NativeSelectOption key={set.id} value={set.id}>
              {set.setCode} · {set.name} · {set.assetCodes.join(" + ")}
            </NativeSelectOption>)}
          </SelectField>
          <label className="flex items-center gap-2 text-sm">
            <input className="size-4 accent-primary" required type="checkbox" />
            I understand these gauges will no longer move as one set.
          </label>
        </ActionForm>
      </FormSection> : null}
    </> : null}
  </div>
}
