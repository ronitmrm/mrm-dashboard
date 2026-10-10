type StoreStockItem = {
  availableStock: string
  companyOnHand: string
  id: string
  storageLocations: string
  trackingMode: "CONSUMABLE" | "SERIALIZED"
  typeCode: string
  unit: string
}

type StoreStockPhysicalUnit = {
  accountableStoreName: string
  assetCode: string
  holderName: string | null
  holderReference: string | null
  holderType: string
  id: string
  isAvailableToIssueHere: boolean
  isMainAccountable: boolean
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
    const withUnit = (quantity: string) => `${quantity} ${item.unit}`
    if (item.trackingMode !== "SERIALIZED") {
      return [
        {
          ...item,
          actionItem: true,
          assignedQuantity: "—",
          availableQuantity: withUnit(item.availableStock),
          companyQuantity: withUnit(item.companyOnHand),
          displayedCode: item.typeCode,
          locationHolder:
            Number(item.availableStock) > 0 ? item.storageLocations : "—",
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
        assignedQuantity: withUnit(
          String(units.filter((unit) => unit.status === "ASSIGNED").length)
        ),
        availableQuantity: withUnit(item.availableStock),
        companyQuantity: withUnit(item.companyOnHand),
        displayedCode: item.typeCode,
        locationHolder: "—",
        physicalUnit: null,
        rowKey: item.id,
        unitId: null,
      },
      ...units.map((physicalUnit) => ({
        ...item,
        actionItem: false,
        assignedQuantity: withUnit(
          physicalUnit.status === "ASSIGNED" ? "1" : "0"
        ),
        availableQuantity: withUnit(
          physicalUnit.isAvailableToIssueHere ? "1" : "0"
        ),
        companyQuantity: withUnit(
          ["SCRAPPED", "LOST"].includes(physicalUnit.status) ? "0" : "1"
        ),
        displayedCode: physicalUnit.assetCode,
        locationHolder:
          physicalUnit.locationName ??
          physicalUnit.holderName ??
          physicalUnit.holderReference ??
          "—",
        physicalUnit,
        rowKey: physicalUnit.id,
        unitId: physicalUnit.assetCode,
      })),
    ]
  })
}
