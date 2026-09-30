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
          assignedQuantity: "—",
          availableQuantity: `${item.availableStock} ${item.unit}`,
          displayedCode: item.typeCode,
          physicalUnit: null,
          rowKey: item.id,
          unitId: null,
        },
      ]
    }

    const units = unitsByItem.get(item.id) ?? []
    return [
      {
        ...item,
        actionItem: true,
        assignedQuantity: String(
          units.filter((unit) => unit.status === "ASSIGNED").length
        ),
        availableQuantity: "—",
        displayedCode: item.typeCode,
        physicalUnit: null,
        rowKey: item.id,
        unitId: null,
      },
      ...units.map((physicalUnit) => ({
        ...item,
        actionItem: false,
        assignedQuantity: physicalUnit.status === "ASSIGNED" ? "1" : "0",
        availableQuantity:
          physicalUnit.status === "AVAILABLE" &&
          physicalUnit.holderType === "STORE"
            ? "1"
            : "0",
        displayedCode: physicalUnit.assetCode,
        physicalUnit,
        rowKey: physicalUnit.id,
        unitId: physicalUnit.assetCode,
      })),
    ]
  })
}
