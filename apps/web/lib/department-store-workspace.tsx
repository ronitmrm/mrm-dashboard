import { createDepartmentStoreRepository, createStoreRepository } from "@workspace/db"

import { DepartmentStoreWorkspace } from "@/components/store/department-store-workspace"
import { readAuthEnvironment } from "@/lib/auth/auth"
import { listGrantedCapabilities, requireCapability } from "@/lib/auth/require-capability"
import { listGrantedStoreActions } from "@/lib/auth/store-action-access"
import { getWebPostgresPool } from "@/lib/postgres-runtime"

export async function renderDepartmentStoreWorkspace(input: {
  basePath: string
  readCapability: string
  saved?: boolean
  storeCode: string
  writeCapability: string
}) {
  const session = await requireCapability(input.readCapability, input.basePath)
  const canWrite = (await listGrantedCapabilities(session.user.id, [input.writeCapability])).length > 0
  const canRepair = input.storeCode === "MAIN"
    ? (await listGrantedStoreActions(session.user.id)).has("store.asset_repair.write")
    : canWrite
  const store = createStoreRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const options = await (async () => {
    const organizationId = await store.organizationIdForCode("MRMPL")
    const [departments, machines, vendors] = canWrite
      ? await Promise.all([
          store.listMovementDepartments(organizationId),
          store.listMovementMachines(organizationId),
          store.listVendors(organizationId),
        ])
      : [[], [], []]
    return { organizationId, departments, machines, vendors }
  })().finally(() => store.close())
  const repository = createDepartmentStoreRepository({ pool: getWebPostgresPool() })
  const workspace = await repository.listStoreWorkspace({
    organizationId: options.organizationId,
    storeCode: input.storeCode,
  })
  const orders = createStoreRepository({ connectionString: readAuthEnvironment().connectionString })
  const repairOrders = await orders.listPurchaseOrders(options.organizationId, {
    repairOnly: true,
    originStoreId: workspace.store.id,
  })
    .finally(() => orders.close())
  const equipmentRepairOrders = repairOrders.filter((order) => !order.calibrationVisitId)

  return (
    <DepartmentStoreWorkspace
      canWrite={canWrite}
      canRepair={canRepair}
      saved={input.saved ?? false}
      departments={options.departments}
      machines={options.machines}
      repairOrders={equipmentRepairOrders}
      vendors={options.vendors}
      workspace={workspace}
    />
  )
}
