import {
  createDashboardReadModelRepository,
  createStoreRepository,
} from "@workspace/db"
import { normalizeProductionFloorCode } from "@workspace/db/production-floors"
import { readAuthEnvironment } from "@/lib/auth/auth"
import {
  requireCapability,
  listGrantedCapabilities,
} from "@/lib/auth/require-capability"
import {
  productionMasterCapability,
  productionMasterSnapshot,
} from "@/lib/auth/production-master-access"
import { masterCapability } from "@/lib/auth/master-capabilities"
import { parseStoreMasterKey } from "@/lib/store-master-selection"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const entry = params.get("entry") ?? ""
  const floor = normalizeProductionFloorCode(params.get("floor"))
  const storeMaster = parseStoreMasterKey(params.get("storeMaster"))
  const capability =
    entry === "store_masters" && storeMaster
      ? masterCapability(storeMaster, "read")
      : productionMasterCapability(entry, "read", floor)
  if (!capability)
    return Response.json({ error: "Unknown master." }, { status: 400 })
  const session = await requireCapability(capability, "/masters")
  const saveKey = productionMasterCapability(entry, "save", floor)
  const saveGrants = saveKey
    ? await listGrantedCapabilities(session.user.id, [saveKey])
    : []
  const repository = createDashboardReadModelRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  try {
    const organizationId = await repository.organizationIdForCode("MRMPL")
    const state = await repository.state(organizationId, {}, floor)
    const dashboard = productionMasterSnapshot(
      state.dashboard,
      new Set([capability, ...saveGrants]),
      floor
    )
    if (entry === "tooling" && saveGrants.length > 0) {
      const store = createStoreRepository({
        connectionString: readAuthEnvironment().connectionString,
      })
      try {
        dashboard.productionControl.toolingAssetCodes = (
          await store.listItemTypes(organizationId)
        ).map(({ typeCode }) => typeCode)
      } finally {
        await store.close()
      }
    }
    return Response.json(
      {
        productionFloorCode: floor,
        version: state.version,
        notModified: false,
        coverage: null,
        status: { isRefreshing: state.status.isRefreshing },
        dashboard,
      },
      { headers: { "Cache-Control": "no-store" } }
    )
  } finally {
    await repository.close()
  }
}
