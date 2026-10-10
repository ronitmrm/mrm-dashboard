"use client"

import { useActionState, useState } from "react"

import type { StoreTransferActionState } from "@/app/store/actions"
import { formatIstDate } from "@/lib/date-time"
import { Button } from "@workspace/ui/components/button"
import { StatusBadge } from "@workspace/ui/components/badge"
import { DialogClose, DialogFooter } from "@workspace/ui/components/dialog"
import { FieldSet } from "@workspace/ui/components/field"
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
import {
  StoreStorageLocationField,
  type StoreStorageLocations,
} from "./store-storage-location-field"

type RequestLine = {
  assetName: string
  id: string
  itemTypeId: string
  requestedUnitCode: string | null
  typeCode: string
}

type UnitChoice = {
  acquiredOn: string | null
  assetCode: string
  itemTypeId: string
  reservedRequestId: string | null
}

export function StoreTransferConfirmation({
  action,
  choices,
  destinationStoreCode,
  destinationStoreName,
  lines,
  storageLocations,
}: {
  action: (
    state: StoreTransferActionState,
    formData: FormData
  ) => Promise<StoreTransferActionState>
  choices: UnitChoice[]
  destinationStoreCode: string
  destinationStoreName: string
  lines: RequestLine[]
  storageLocations: StoreStorageLocations
}) {
  const lineIds = new Set(lines.map((line) => line.id))
  const available = choices.filter(
    (unit) => !unit.reservedRequestId || lineIds.has(unit.reservedRequestId)
  )
  const [selected, setSelected] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      lines.map((line) => [
        line.id,
        available.some((unit) => unit.assetCode === line.requestedUnitCode)
          ? line.requestedUnitCode!
          : "",
      ])
    )
  )
  const [state, dispatch, pending] = useActionState(action, { error: null })
  const [selectedLocations, setSelectedLocations] = useState<
    Record<string, string>
  >({})
  const selectedCount = lines.filter((line) => selected[line.id]).length
  const changedCount = lines.filter(
    (line) => selected[line.id] && selected[line.id] !== line.requestedUnitCode
  ).length

  return (
    <form action={dispatch} className="grid min-w-0 gap-4">
      <input
        name="destination_store_code"
        type="hidden"
        value={destinationStoreCode}
      />
      <div className="flex flex-wrap items-center gap-2" aria-live="polite">
        <StatusBadge
          tone={selectedCount === lines.length ? "positive" : "warning"}
          value={selectedCount + " of " + lines.length + " units selected"}
        />
        {changedCount > 0 ? (
          <StatusBadge tone="information" value={changedCount + " changed"} />
        ) : null}
      </div>
      <p className="text-sm text-muted-foreground">
        Main Store units with no acquisition date are assigned first, then the
        oldest dated stock. Check the Unit IDs and receiving locations below.
        Change either selection if needed.
      </p>
      <FieldSet disabled={pending}>
        <OperationalTable
          excelFilters={false}
          containerClassName="max-h-[50dvh] rounded-lg border"
        >
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead>Assigned Unit ID</TableHead>
              <TableHead>Acquisition Date</TableHead>
              <TableHead>Receiving Location</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((line, index) => {
              const unit = available.find(
                (choice) => choice.assetCode === selected[line.id]
              )
              return (
                <TableRow key={line.id}>
                  <TableCell>
                    <span className="block font-medium">{line.typeCode}</span>
                    <span className="block">{line.assetName}</span>
                  </TableCell>
                  <TableCell>
                    <input
                      name="requisition_id"
                      type="hidden"
                      value={line.id}
                    />
                    <NativeSelect
                      aria-label={line.typeCode + " Unit ID " + (index + 1)}
                      className="w-full min-w-44"
                      name="asset_code"
                      required
                      value={selected[line.id] ?? ""}
                      onValueChange={(assetCode) =>
                        setSelected((current) => ({
                          ...current,
                          [line.id]: assetCode,
                        }))
                      }
                    >
                      <NativeSelectOption disabled value="">
                        Select an available Unit ID
                      </NativeSelectOption>
                      {available
                        .filter(
                          (choice) => choice.itemTypeId === line.itemTypeId
                        )
                        .map((choice) => (
                          <NativeSelectOption
                            key={choice.assetCode}
                            value={choice.assetCode}
                            disabled={lines.some(
                              (other) =>
                                other.id !== line.id &&
                                selected[other.id] === choice.assetCode
                            )}
                          >
                            {choice.assetCode}
                          </NativeSelectOption>
                        ))}
                    </NativeSelect>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {!unit
                        ? "Select a replacement; the assigned unit is unavailable."
                        : unit.assetCode === line.requestedUnitCode
                          ? "Automatically assigned"
                          : "Changed by you"}
                    </span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {unit?.acquiredOn
                      ? formatIstDate(unit.acquiredOn)
                      : "Not recorded"}
                  </TableCell>
                  <TableCell className="min-w-56">
                    <StoreStorageLocationField
                      id={"batch-transfer-location-" + line.id}
                      itemTypeId={line.itemTypeId}
                      name={"destination_location_" + line.id}
                      storage={storageLocations}
                      storeCode={destinationStoreCode}
                      compact
                      label={line.typeCode + " location " + (index + 1)}
                      value={selectedLocations[line.id]}
                      onValueChange={(locationId) =>
                        setSelectedLocations((current) => ({
                          ...current,
                          [line.id]: locationId,
                        }))
                      }
                    />
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </OperationalTable>
      </FieldSet>
      {state.error ? (
        <StandardState
          variant="error"
          title="Transfer could not be saved"
          description={state.error}
        />
      ) : null}
      <DialogFooter className="items-center">
        <p className="mr-auto text-sm text-muted-foreground">
          {lines.length}{" "}
          {lines.length === 1 ? "unit will move" : "units will move together"}{" "}
          to {destinationStoreName}.
        </p>
        <DialogClose asChild>
          <Button disabled={pending} type="button" variant="outline">
            Back to Requests
          </Button>
        </DialogClose>
        <Button
          disabled={pending || selectedCount !== lines.length || !lines.length}
          type="submit"
        >
          {pending
            ? "Transferring…"
            : "Confirm Transfer (" + lines.length + ")"}
        </Button>
      </DialogFooter>
    </form>
  )
}
