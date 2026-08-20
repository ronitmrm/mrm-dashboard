type StoreStockItem = {
  availableStock: string
  availableUnitIds: string[]
  id: string
  trackingMode: "CONSUMABLE" | "SERIALIZED"
  typeCode: string
  unit: string
}

export function storeStockRows<T extends StoreStockItem>(items: readonly T[]) {
  return items.flatMap((item) => {
    if (item.trackingMode !== "SERIALIZED") {
      return [
        {
          ...item,
          actionItem: true,
          displayedQuantity: `${item.availableStock} ${item.unit}`,
          rowKey: item.id,
          unitId: null,
        },
      ]
    }

    const unitIds = item.availableUnitIds.length
      ? item.availableUnitIds
      : [null]
    return unitIds.map((unitId, index) => ({
      ...item,
      actionItem: index === 0,
      displayedQuantity: unitId ? "1 physical unit" : "0 physical units",
      rowKey: `${item.id}:${unitId ?? "none"}`,
      unitId,
    }))
  })
}
