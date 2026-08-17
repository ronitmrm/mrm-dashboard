import { createStoreRepository } from "@workspace/db"

import { readAuthEnvironment } from "@/lib/auth/auth"
import {
  listGrantedCapabilities,
  requireCapability,
} from "@/lib/auth/require-capability"

import { StoreMasterWorkspace } from "./master-workspace"

export default async function StoreMastersPage() {
  const session = await requireCapability("store.read", "/store/masters")
  const canManage =
    (await listGrantedCapabilities(session.user.id, ["store.manage"])).length > 0
  const repository = createStoreRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const data = await (async () => {
    const organizationId = await repository.organizationIdForCode("MRMPL")
    const [items, locations, suppliers, vendors, masters] = await Promise.all([
      repository.listItemTypes(organizationId),
      repository.listLocations(organizationId),
      repository.listSuppliers(organizationId),
      repository.listVendors(organizationId),
      repository.listAssetClassificationMasters(organizationId),
    ])
    return { items, locations, masters, suppliers, vendors }
  })().finally(() => repository.close())

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">
          Store Masters
        </h2>
        <p className="text-sm text-muted-foreground">
          Select one master for data entry and review its saved records below.
        </p>
      </div>
      <StoreMasterWorkspace canManage={canManage} data={data} />
    </div>
  )
}
