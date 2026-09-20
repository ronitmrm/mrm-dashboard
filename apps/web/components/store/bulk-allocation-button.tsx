"use client"

import * as React from "react"

import { StandardDialogContent } from "@/components/ui/golden-patterns"
import { serializedAllocationSelections } from "@/lib/store/bulk-allocation-selection"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogClose,
  DialogFooter,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"

type AllocationSelection = {
  availableUnitIds: string[]
  department: string
  id: string
  itemLabel: string
  itemTypeId: string
  remainingQuantity: number
  trackingMode: "BULK" | "SERIALIZED"
}

type AssetSlot = {
  index: number
  key: string
  line: AllocationSelection
}

function parseUnitIds(value: string | undefined) {
  if (!value) return []
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed)
      ? parsed.filter((unitId): unitId is string => typeof unitId === "string")
      : []
  } catch {
    return []
  }
}

function selectedAllocationLines(formId: string): AllocationSelection[] {
  return Array.from(
    document.querySelectorAll<HTMLInputElement>('input[name="requisition_id"]')
  )
    .filter(
      (input) =>
        input.getAttribute("form") === formId &&
        input.checked &&
        !input.disabled
    )
    .map((input) => ({
      availableUnitIds: parseUnitIds(input.dataset.allocationUnitIds),
      department: input.dataset.selectionGroupLabel ?? "",
      id: input.value,
      itemLabel: input.dataset.allocationItemLabel ?? input.value,
      itemTypeId: input.dataset.allocationItemTypeId ?? "",
      remainingQuantity: Number(input.dataset.allocationRemainingQuantity ?? 0),
      trackingMode:
        input.dataset.allocationTrackingMode === "SERIALIZED"
          ? "SERIALIZED"
          : "BULK",
    }))
}

function assetSlotsFor(selection: AllocationSelection[]): AssetSlot[] {
  return selection.flatMap((line) =>
    line.trackingMode === "SERIALIZED"
      ? Array.from({ length: line.remainingQuantity }, (_, index) => ({
          index,
          key: `${line.id}:${index}`,
          line,
        }))
      : []
  )
}

export function BulkAllocationButton({ formId }: { formId: string }) {
  const [open, setOpen] = React.useState(false)
  const [selection, setSelection] = React.useState<AllocationSelection[]>([])
  const [assetSelections, setAssetSelections] = React.useState<
    Record<string, string>
  >({})

  const syncSelection = React.useCallback(() => {
    const nextSelection = selectedAllocationLines(formId)
    const activeSlots = new Set(
      assetSlotsFor(nextSelection).map((slot) => slot.key)
    )
    setSelection(nextSelection)
    setAssetSelections((current) =>
      serializedAllocationSelections(
        nextSelection,
        Object.fromEntries(
          Object.entries(current).filter(([key]) => activeSlots.has(key))
        )
      )
    )
  }, [formId])

  React.useEffect(() => {
    const handleChange = (event: Event) => {
      const target = event.target
      if (
        target instanceof HTMLInputElement &&
        target.getAttribute("form") === formId &&
        target.name === "requisition_id"
      ) {
        syncSelection()
      }
    }
    document.addEventListener("change", handleChange)
    return () => document.removeEventListener("change", handleChange)
  }, [formId, syncSelection])

  React.useEffect(() => {
    const form = document.getElementById(formId)
    if (!(form instanceof HTMLFormElement)) return
    const handleReset = () => {
      setOpen(false)
      setSelection([])
      setAssetSelections({})
    }
    form.addEventListener("reset", handleReset)
    return () => form.removeEventListener("reset", handleReset)
  }, [formId])

  const assetSlots = assetSlotsFor(selection)
  const chosenAssetKeys = new Set(
    assetSlots.flatMap((slot) => {
      const assetCode = assetSelections[slot.key]
      return assetCode
        ? [`${slot.line.itemTypeId}:${assetCode.toLowerCase()}`]
        : []
    })
  )
  const hasCompleteAssetSelection =
    assetSlots.every((slot) => Boolean(assetSelections[slot.key])) &&
    chosenAssetKeys.size === assetSlots.length
  const department = selection[0]?.department ?? ""

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        if (nextOpen) syncSelection()
        setOpen(nextOpen)
      }}
      open={open}
    >
      <DialogTrigger asChild>
        <Button disabled={selection.length === 0} size="sm" type="button">
          Allocate Selected ({selection.length})
        </Button>
      </DialogTrigger>
      <StandardDialogContent
        className="max-h-[85vh] overflow-y-auto sm:max-w-2xl"
        description={
          <>
            Allocate {selection.length} selected{" "}
            {selection.length === 1 ? "line" : "lines"} in full to one
            Department. Quantity-one serialized lines start with the first
            available Unit ID; change it if needed. If any stock changed, no
            line is allocated.
          </>
        }
        title="Allocate selected request lines"
      >
        <FieldGroup className="grid gap-4">
          <Field>
            <FieldLabel htmlFor="bulk-allocation-department">
              Department
            </FieldLabel>
            <Input
              id="bulk-allocation-department"
              readOnly
              value={department}
            />
          </Field>
          <div className="grid gap-3">
            {selection.map((line) => {
              const lineSlots = assetSlots.filter(
                (slot) => slot.line.id === line.id
              )
              return (
                <div className="rounded-md border p-3" key={line.id}>
                  <p className="font-medium">{line.itemLabel}</p>
                  <p className="text-sm text-muted-foreground">
                    Allocate remaining quantity: {line.remainingQuantity}
                  </p>
                  {lineSlots.length ? (
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      {lineSlots.map((slot) => {
                        const selectedCode = assetSelections[slot.key] ?? ""
                        return (
                          <label
                            className="grid gap-1 text-xs font-medium"
                            key={slot.key}
                          >
                            Unit ID {slot.index + 1}
                            <NativeSelect
                              aria-label={`${line.itemLabel} Unit ID ${slot.index + 1}`}
                              form={formId}
                              name={`asset_code_${line.id}`}
                              onChange={(event) =>
                                setAssetSelections((current) => ({
                                  ...current,
                                  [slot.key]: event.target.value,
                                }))
                              }
                              required
                              value={selectedCode}
                            >
                              <NativeSelectOption disabled value="">
                                Select available Unit ID / Serial ID
                              </NativeSelectOption>
                              {line.availableUnitIds.map((unitId) => {
                                const assetKey = `${line.itemTypeId}:${unitId.toLowerCase()}`
                                return (
                                  <NativeSelectOption
                                    disabled={
                                      selectedCode !== unitId &&
                                      chosenAssetKeys.has(assetKey)
                                    }
                                    key={unitId}
                                    value={unitId}
                                  >
                                    {unitId}
                                  </NativeSelectOption>
                                )
                              })}
                            </NativeSelect>
                          </label>
                        )
                      })}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        </FieldGroup>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </DialogClose>
          <Button
            disabled={selection.length === 0 || !hasCompleteAssetSelection}
            form={formId}
            type="submit"
          >
            Allocate Selected in Full
          </Button>
        </DialogFooter>
      </StandardDialogContent>
    </Dialog>
  )
}
