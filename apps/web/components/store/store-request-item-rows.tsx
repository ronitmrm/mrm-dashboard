"use client"

import { useState } from "react"

import { Input } from "@workspace/ui/components/input"
import { NativeSelect, NativeSelectOption } from "@workspace/ui/components/native-select"
import {
  OperationalTable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import { useStoreRequestKind } from "@/components/store/store-request-purpose-fields"

type RequestItem = {
  availableStock: string
  id: string
  identificationName: string
  trackingMode: "SERIALIZED" | "CONSUMABLE"
  typeCode: string
  unit: string
}

type PhysicalUnit = {
  assetCode: string
  id: string
  isMainAccountable: boolean
  itemTypeId: string
  status: string
}

function RequestItemRow({ item, physicalUnits }: {
  item: RequestItem
  physicalUnits: PhysicalUnit[]
}) {
  const { kind } = useStoreRequestKind()
  const [quantity, setQuantity] = useState("")
  const [selectedUnitIds, setSelectedUnitIds] = useState<string[]>([])
  const units = physicalUnits.filter((unit) =>
    unit.itemTypeId === item.id && unit.isMainAccountable &&
    unit.status !== "SCRAPPED" && unit.status !== "LOST")
  const exactUnitTransfer = kind === "STORE_TRANSFER" && item.trackingMode === "SERIALIZED"
  const unitCount = Number(quantity)
  const selectionCount = exactUnitTransfer && Number.isInteger(unitCount) && unitCount > 0
    ? Math.min(unitCount, units.length) : 0

  return (
    <TableRow>
      <TableCell className="font-medium">
        {item.typeCode}
        {!exactUnitTransfer ? <input name="item_type_id" type="hidden" value={item.id} /> : null}
      </TableCell>
      <TableCell>{item.identificationName}</TableCell>
      <TableCell>{item.availableStock} {item.unit}</TableCell>
      <TableCell>
        {exactUnitTransfer ? (
          <div className="grid gap-2">
            {Array.from({ length: selectionCount }, (_, index) => (
              <div className="grid gap-1" key={index}>
                <label className="text-xs" htmlFor={`${item.id}-unit-${index}`}>
                  Physical Unit {index + 1}
                </label>
                <NativeSelect
                  id={`${item.id}-unit-${index}`}
                  name="requested_unit_id"
                  onValueChange={(value) => setSelectedUnitIds((current) => {
                    const next = [...current]
                    next[index] = value
                    return next
                  })}
                  required
                  value={selectedUnitIds[index] ?? ""}
                >
                  <NativeSelectOption disabled value="">Select Unit ID</NativeSelectOption>
                  {units.map((unit) => (
                    <NativeSelectOption
                      disabled={selectedUnitIds.some((selected, position) =>
                        position !== index && selected === unit.id)}
                      key={unit.id}
                      value={unit.id}
                    >
                      {unit.assetCode} · {unit.status}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                <input name="item_type_id" type="hidden" value={item.id} />
                <input name="quantity" type="hidden" value="1" />
              </div>
            ))}
            {!selectionCount ? <span>Enter a quantity to select Unit IDs.</span> : null}
          </div>
        ) : item.trackingMode === "SERIALIZED" ? (
          <NativeSelect aria-label={`Requested Unit ID for ${item.typeCode}`}
            defaultValue="" name="requested_unit_id">
            <NativeSelectOption value="">Any Unit ID / Store selects</NativeSelectOption>
            {units.map((unit) => (
              <NativeSelectOption key={unit.id} value={unit.id}>
                {unit.assetCode} · {unit.status}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        ) : (
          <>
            Not applicable
            <input name="requested_unit_id" type="hidden" value="" />
          </>
        )}
      </TableCell>
      <TableCell>
        <Input
          aria-label={`Requested quantity for ${item.typeCode}`}
          max={exactUnitTransfer ? units.length : undefined}
          min={item.trackingMode === "SERIALIZED" ? "1" : "0.001"}
          name={exactUnitTransfer ? undefined : "quantity"}
          onChange={(event) => setQuantity(event.target.value)}
          required
          step={item.trackingMode === "SERIALIZED" ? "1" : "0.001"}
          type="number"
          value={quantity}
        />
      </TableCell>
    </TableRow>
  )
}

export function StoreRequestItemRows({ items, physicalUnits }: {
  items: RequestItem[]
  physicalUnits: PhysicalUnit[]
}) {
  return (
    <OperationalTable>
      <TableHeader>
        <TableRow>
          <TableHead>Item Code</TableHead>
          <TableHead>Identification</TableHead>
          <TableHead>Current Stock</TableHead>
          <TableHead className="min-w-52">Requested Unit ID</TableHead>
          <TableHead className="w-48">Requested Quantity</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <RequestItemRow item={item} key={item.id} physicalUnits={physicalUnits} />
        ))}
      </TableBody>
    </OperationalTable>
  )
}
