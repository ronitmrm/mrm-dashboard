import { createDepartmentStoreRepository, createStoreRepository } from "@workspace/db"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { accountableStoreHref, accountableStorePermission } from "@/lib/auth/department-store-capabilities"
import { requireCapability } from "@/lib/auth/require-capability"
import { masterCsvResponse } from "@/lib/master-data-csv"
import { getWebPostgresPool } from "@/lib/postgres-runtime"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const storeCode = new URL(request.url).searchParams.get("store") ?? "MAIN"
  await requireCapability(accountableStorePermission(storeCode, "read"),
    storeCode === "MAIN" ? "/store/stock" : accountableStoreHref(storeCode))
  const store = createStoreRepository({ connectionString: readAuthEnvironment().connectionString })
  const organizationId = await store.organizationIdForCode("MRMPL").finally(() => store.close())
  const repository = createDepartmentStoreRepository({ pool: getWebPostgresPool() })
  const workspace = await repository.listStoreWorkspace({ organizationId, storeCode })
  const allocations = workspace.store.productionFloorCode
    ? await repository.listDepartmentAllocations({
        organizationId, productionFloorCode: workspace.store.productionFloorCode,
      })
    : []
  const units = new Map([
    ...workspace.assets.filter((asset) => asset.storageAssignable &&
      asset.status !== "SCRAPPED" && asset.status !== "LOST"),
    ...allocations,
  ].filter((asset) => !asset.inGaugeSet)
    .map((asset) => [asset.assetCode, asset]))
  return masterCsvResponse([
    ...[...units.values()].map((asset) => ({
      unit_id: asset.assetCode, asset_code: "", asset_name: asset.assetName,
      location_code: "", note: "",
    })),
    ...workspace.consumables.filter((item) => Number(item.availableQuantity) > 0)
      .map((item) => ({
        unit_id: "", asset_code: item.typeCode, asset_name: item.assetName,
        location_code: "", note: "",
      })),
  ], `${workspace.store.code.toLowerCase()}-storage-locations.csv`,
  ["unit_id", "asset_code", "asset_name", "location_code", "note"])
}
