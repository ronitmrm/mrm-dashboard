import { randomUUID } from "node:crypto"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Wrench } from "lucide-react"
import { createDepartmentStoreRepository, createStoreRepository } from "@workspace/db"
import { Button } from "@workspace/ui/components/button"

import { DepartmentRepairOrderForm } from "@/components/store/department-repair-order-form"
import { PageHeader } from "@/components/ui/golden-patterns"
import { readAuthEnvironment } from "@/lib/auth/auth"
import { accountableStoreHref, accountableStorePermission } from "@/lib/auth/department-store-capabilities"
import { requireCapability } from "@/lib/auth/require-capability"
import { requireStoreAction } from "@/lib/auth/store-action-access"
import { getWebPostgresPool } from "@/lib/postgres-runtime"

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

export default async function DepartmentRepairOrderPage({ searchParams }: {
  searchParams: Promise<{
    asset_code?: string | string[]
    issuance_id?: string | string[]
    store?: string | string[]
  }>
}) {
  const params = await searchParams
  const storeCode = first(params.store) || ""
  let returnPath: string
  try {
    returnPath = accountableStoreHref(storeCode)
  } catch {
    notFound()
  }
  const path = `/department-store/repair?store=${encodeURIComponent(storeCode)}`
  const session = storeCode === "MAIN"
    ? await requireStoreAction("store.asset_repair.write", path)
    : await requireCapability(accountableStorePermission(storeCode, "write"), path)
  const store = createStoreRepository({ connectionString: readAuthEnvironment().connectionString })
  const data = await (async () => {
    const organizationId = await store.organizationIdForCode("MRMPL")
    const [suppliers, departments] = await Promise.all([
      store.listSuppliers(organizationId),
      storeCode === "MAIN" ? store.listMovementDepartments(organizationId) : Promise.resolve([]),
    ])
    return {
      organizationId,
      suppliers,
      departments,
    }
  })().finally(() => store.close())
  const departmentRepository = createDepartmentStoreRepository({ pool: getWebPostgresPool() })
  const workspace = await departmentRepository.listStoreWorkspace({
    organizationId: data.organizationId,
    storeCode,
  })
  const selectedCodes = (Array.isArray(params.asset_code)
    ? params.asset_code
    : params.asset_code ? [params.asset_code] : [])
    .map((value) => value.trim().toLowerCase())
  const selected = workspace.assets.filter((asset) =>
    selectedCodes.includes(asset.assetCode.toLowerCase()) &&
    asset.status !== "SCRAPPED" && asset.status !== "LOST"
  )
  const issuanceId = first(params.issuance_id)
  const safeIssuanceId = issuanceId && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(issuanceId)
    ? issuanceId : randomUUID()

  return <div className="grid min-w-0 gap-5">
    <PageHeader
      description={`Issue supplier repair service orders for Unit IDs accountable to ${workspace.store.name}. The return is recorded in the same Store.`}
      icon={Wrench}
      title="Repair Purchase Order"
      actions={<Button asChild size="sm" variant="outline"><Link href={returnPath}>Back to Store</Link></Button>}
    />
    {selected.length ? (
      <DepartmentRepairOrderForm
        departments={data.departments}
        issuanceId={safeIssuanceId}
        selected={selected}
        storeCode={storeCode}
        suppliers={data.suppliers}
      />
    ) : (
      <p className="text-sm text-muted-foreground">Select one or more eligible Unit IDs from your Store to create a repair PO.</p>
    )}
    <span className="sr-only">Requested by {session.user.name}</span>
  </div>
}
