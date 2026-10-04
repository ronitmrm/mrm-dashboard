import { createDepartmentStoreRepository, createStoreRepository } from "@workspace/db"

import { DepartmentStoreRegister } from "@/components/store/department-store-register"
import type { DepartmentStoreAction } from "@/components/store/department-store-forms"
import { readAuthEnvironment } from "@/lib/auth/auth"
import { accountableStorePermission } from "@/lib/auth/department-store-capabilities"
import { listGrantedCapabilities, requireCapability } from "@/lib/auth/require-capability"
import { listGrantedStoreActions } from "@/lib/auth/store-action-access"
import { getWebPostgresPool } from "@/lib/postgres-runtime"

const departmentStoreActions: DepartmentStoreAction[] = [
  "quantity", "accountability", "physical", "consume", "adjust",
  "gauge-create", "gauge-move", "gauge-replace", "gauge-disband",
]

export function departmentStoreAction(value: string | undefined) {
  return departmentStoreActions.find((action) => action === value)
}

export async function renderDepartmentStoreWorkspace(input: {
  basePath: string
  readCapability: string
  saved?: boolean
  action?: DepartmentStoreAction
  selectedItemIds?: string[]
  selectMode?: "use" | "repair" | "calibration"
  storeCode: string
  view?: "stock" | "movement" | "repairs"
  writeCapability: string
}) {
  const session = await requireCapability(input.readCapability, input.basePath)
  const granted = new Set(await listGrantedCapabilities(session.user.id, [
    input.writeCapability,
    accountableStorePermission(input.storeCode, "request"),
  ]))
  const canWrite = granted.has(input.writeCapability)
  const canRequest = granted.has(accountableStorePermission(input.storeCode, "request")) &&
    (await listGrantedStoreActions(session.user.id)).has("store.requests.submit")
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
  const departmentAllocations = workspace.store.productionFloorCode &&
    (input.view ?? "stock") === "stock"
    ? await repository.listDepartmentAllocations({
        organizationId: options.organizationId,
        productionFloorCode: workspace.store.productionFloorCode,
      })
    : []
  const repairOrders = input.view === "repairs"
    ? await (async () => {
        const orders = createStoreRepository({ connectionString: readAuthEnvironment().connectionString })
        try {
          return await orders.listPurchaseOrders(options.organizationId, {
            repairOnly: true,
            originStoreId: workspace.store.id,
          })
        } finally {
          await orders.close()
        }
      })()
    : []
  const equipmentRepairOrders = repairOrders.filter((order) => !order.calibrationVisitId)

  return (
    <DepartmentStoreRegister
      action={input.action}
      basePath={input.basePath}
      canWrite={canWrite}
      canRequest={canRequest}
      canRepair={canRepair}
      saved={input.saved ?? false}
      selectedItemIds={input.selectedItemIds}
      selectMode={input.selectMode}
      departments={options.departments}
      departmentAllocations={departmentAllocations}
      machines={options.machines}
      repairOrders={equipmentRepairOrders}
      vendors={options.vendors}
      view={input.view ?? "stock"}
      workspace={workspace}
    />
  )
}
