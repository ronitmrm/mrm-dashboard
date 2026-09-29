type StoreStockItem = {
  availableStock: string
  id: string
  trackingMode: "CONSUMABLE" | "SERIALIZED"
  typeCode: string
  unit: string
}

type StoreStockPhysicalUnit = {
  assetCode: string
  holderName: string | null
  holderType: string
  id: string
  itemTypeId: string
  locationName: string | null
  status: string
  supplierName: string | null
  unitPrice: string | null
}

export function storeStockRows<T extends StoreStockItem>(
  items: readonly T[],
  physicalUnits: readonly StoreStockPhysicalUnit[]
) {
  const unitsByItem = new Map<string, StoreStockPhysicalUnit[]>()
  for (const unit of physicalUnits) {
    const existing = unitsByItem.get(unit.itemTypeId)
    if (existing) existing.push(unit)
    else unitsByItem.set(unit.itemTypeId, [unit])
  }
  return items.flatMap((item) => {
    if (item.trackingMode !== "SERIALIZED") {
      return [
        {
          ...item,
          actionItem: true,
          displayedCode: item.typeCode,
          displayedQuantity: `${item.availableStock} ${item.unit}`,
          physicalUnit: null,
          rowKey: item.id,
          unitId: null,
        },
      ]
    }

    return [
      {
        ...item,
        actionItem: true,
        displayedCode: item.typeCode,
        displayedQuantity: "—",
        physicalUnit: null,
        rowKey: item.id,
        unitId: null,
      },
      ...(unitsByItem.get(item.id) ?? []).map((physicalUnit) => ({
        ...item,
        actionItem: false,
        displayedCode: physicalUnit.assetCode,
        displayedQuantity:
          physicalUnit.status === "AVAILABLE" &&
          physicalUnit.holderType === "STORE"
            ? "1 physical unit"
            : "—",
        physicalUnit,
        rowKey: physicalUnit.id,
        unitId: physicalUnit.assetCode,
      })),
    ]
  })
}
