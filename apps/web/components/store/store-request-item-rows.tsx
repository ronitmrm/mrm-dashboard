"use client"

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

function RequestItemRow({ item, physicalUnits, transferAvailableCount }: {
  item: RequestItem
  physicalUnits: PhysicalUnit[]
  transferAvailableCount: number
}) {
  const { kind } = useStoreRequestKind()
  const units = physicalUnits.filter((unit) =>
    unit.itemTypeId === item.id && unit.isMainAccountable &&
    unit.status !== "SCRAPPED" && unit.status !== "LOST")
  const exactUnitTransfer = kind === "STORE_TRANSFER" && item.trackingMode === "SERIALIZED"

  return (
    <TableRow>
      <TableCell className="font-medium">
        {item.typeCode}
        <input name="item_type_id" type="hidden" value={item.id} />
      </TableCell>
      <TableCell>{item.identificationName}</TableCell>
      <TableCell>{item.availableStock} {item.unit}</TableCell>
      <TableCell>
        {exactUnitTransfer ? (
          <>
            <span className="text-sm text-muted-foreground">
              {transferAvailableCount} unreserved Main Store Unit IDs · assigned by FIFO on submission
            </span>
            <input name="requested_unit_id" type="hidden" value="" />
          </>
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
          max={exactUnitTransfer ? transferAvailableCount : undefined}
          min={item.trackingMode === "SERIALIZED" ? "1" : "0.001"}
          name="quantity"
          required
          step={item.trackingMode === "SERIALIZED" ? "1" : "0.001"}
          type="number"
        />
      </TableCell>
    </TableRow>
  )
}

export function StoreRequestItemRows({ items, physicalUnits, transferAvailableCounts }: {
  items: RequestItem[]
  physicalUnits: PhysicalUnit[]
  transferAvailableCounts: Record<string, number>
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
          <RequestItemRow item={item} key={item.id} physicalUnits={physicalUnits}
            transferAvailableCount={transferAvailableCounts[item.id] ?? 0} />
        ))}
      </TableBody>
    </OperationalTable>
  )
}
