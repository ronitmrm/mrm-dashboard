import Link from "next/link"
import { createStoreRepository } from "@workspace/db"
import { Button } from "@workspace/ui/components/button"
import { StandardState } from "@workspace/ui/components/standard-state"

import {
  StoreStockTransferForm,
  type StockTransferItem,
} from "@/components/store/store-stock-transfer-form"
import { PageHeader } from "@/components/ui/golden-patterns"
import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"
import { requireStoreAction } from "@/lib/auth/store-action-access"

export default async function StoreStockTransferPage({
  searchParams,
}: {
  searchParams: Promise<{ transfer_item?: string | string[] }>
}) {
  await requireCapability("store.stock.read", "/store/stock/transfer")
  await requireStoreAction(
    "store.asset_movement.write",
    "/store/stock/transfer"
  )
  const params = await searchParams
  const selected = Array.isArray(params.transfer_item)
    ? params.transfer_item
    : params.transfer_item
      ? [params.transfer_item]
      : []
  const repository = createStoreRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const data = await (async () => {
    const organizationId = await repository.organizationIdForCode("MRMPL")
    const [items, units, stores] = await Promise.all([
      repository.listItemTypes(organizationId),
      repository.listStockPhysicalUnits(organizationId, "COMPANY"),
      repository.listRequestableStores(organizationId),
    ])
    const itemById = new Map(items.map((item) => [item.id, item]))
    const unitByCode = new Map(units.map((unit) => [unit.assetCode, unit]))
    const lines: StockTransferItem[] = []
    for (const key of selected) {
      if (key.startsWith("item:")) {
        const item = itemById.get(key.slice(5))
        if (
          item?.trackingMode === "CONSUMABLE" &&
          Number(item.availableStock) > 0
        ) {
          lines.push({
            itemTypeId: item.id,
            code: item.typeCode,
            name: item.assetName,
            availableQuantity: item.availableStock,
            unit: item.unit,
          })
        }
      } else if (key.startsWith("unit:")) {
        const unit = unitByCode.get(key.slice(5))
        const item = unit && itemById.get(unit.itemTypeId)
        if (
          unit?.isMainAccountable &&
          item &&
          unit.status !== "SCRAPPED" &&
          unit.status !== "LOST"
        ) {
          lines.push({
            assetCode: unit.assetCode,
            code: unit.assetCode,
            name: item.assetName,
            unit: item.unit,
          })
        }
      }
    }
    return { lines, stores }
  })().finally(() => repository.close())
  const valid =
    selected.length > 0 &&
    selected.length <= 500 &&
    new Set(selected).size === selected.length &&
    data.lines.length === selected.length
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader title="Transfer responsibility" />
      <Button asChild className="w-fit" variant="outline">
        <Link href="/store/stock?mode=transfer">Back to selection</Link>
      </Button>
      {valid ? (
        <StoreStockTransferForm items={data.lines} stores={data.stores} />
      ) : (
        <StandardState
          variant="error"
          title="Select available Main Store stock"
          description="Choose 1 to 500 distinct Consumable Asset Codes or Unit IDs accountable to Main Store."
        />
      )}
    </div>
  )
}
