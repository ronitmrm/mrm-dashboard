import Link from "next/link"
import { createDepartmentStoreRepository, createStoreRepository } from "@workspace/db"
import { ArrowRightLeft } from "lucide-react"

import { StoreMovementWorkspace } from "@/components/store/store-movement-workspace"
import { PageHeader } from "@/components/ui/golden-patterns"
import { readAuthEnvironment } from "@/lib/auth/auth"
import { listGrantedCapabilities, requireCapability } from "@/lib/auth/require-capability"
import { listGrantedStoreActions } from "@/lib/auth/store-action-access"
import { signedInPerformer } from "@/lib/auth/signed-in-machinist"
import { formatIstDate, formatIstDateTime } from "@/lib/date-time"
import { getWebPostgresPool } from "@/lib/postgres-runtime"

import { StatusBadge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { CardContent, CardHeader, CardTitle, SectionCard } from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { OperationalTable, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@workspace/ui/components/table"

function firstValue(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value) ?? ""
}

function movementLabel(kind: string) {
  switch (kind) {
    case "ACCOUNTABILITY_TRANSFER": return "Responsibility transfer"
    case "TRANSFER": return "Quantity transfer"
    case "TRANSFER_OUT": return "Transfer out"
    case "TRANSFER_IN": return "Transfer in"
    case "CONSUMPTION": return "Consumed"
    case "RECEIPT": return "Received"
    case "ISSUE": return "Issued"
    case "RETURN": return "Returned"
    case "LOSS": return "Lost"
    case "ADJUSTMENT": return "Stock adjustment"
    default: return kind.replaceAll("_", " ")
  }
}

function movementPageHref(page: number, code: string) {
  const params = new URLSearchParams({ page: String(page) })
  if (code) params.set("code", code)
  return `/store/movement?${params}`
}

export default async function StoreMovementPage({
  searchParams,
}: {
  searchParams: Promise<{
    code?: string | string[]
    moved?: string | string[]
    page?: string | string[]
    saved?: string | string[]
    unitId?: string | string[]
  }>
}) {
  const session = await requireCapability("store.asset_history.read", "/store/movement")
  const canMove = (await listGrantedStoreActions(session.user.id)).has(
    "store.asset_movement.write"
  )
  const canViewStock = (await listGrantedCapabilities(
    session.user.id, ["store.stock.read"]
  )).length > 0
  const canTransfer = canMove && canViewStock
  const params = await searchParams
  const code = firstValue(params.code).trim()
  const requestedPage = Number(firstValue(params.page))
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0
    ? requestedPage : 1
  const repository = createStoreRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const data = await (async () => {
    const organizationId = await repository.organizationIdForCode("MRMPL")
    const departmentRepository = createDepartmentStoreRepository({ pool: getWebPostgresPool() })
    const [workspace, companyMovements, units, vendors, locations, departments, machines, performer, unitMovements] = await Promise.all([
      departmentRepository.listStoreWorkspace({ organizationId, storeCode: "MAIN" }),
      canViewStock
        ? departmentRepository.listCompanyMovements({ organizationId, code, page })
        : Promise.resolve(null),
      canMove ? repository.listAssets({ organizationId }) : Promise.resolve([]),
      canMove ? repository.listVendors(organizationId) : Promise.resolve([]),
      canMove ? repository.listLocations(organizationId) : Promise.resolve([]),
      canMove ? repository.listMovementDepartments(organizationId) : Promise.resolve([]),
      canMove ? repository.listMovementMachines(organizationId) : Promise.resolve([]),
      canMove
        ? signedInPerformer({
            connectionString: readAuthEnvironment().connectionString,
            organizationId,
            userId: session.user.id,
            userName: session.user.name,
          })
        : Promise.resolve(null),
      canViewStock ? Promise.resolve([]) : repository.listRecentAssetMovements(organizationId),
    ])
    return { workspace, companyMovements, units, vendors, locations, departments, machines, performer, unitMovements }
  })().finally(() => repository.close())
  const accountableUnitIds = new Set(data.workspace.assets.map((asset) => asset.assetCode))
  const movableUnits = data.units.filter(
    (unit) => accountableUnitIds.has(unit.assetCode) && unit.status !== "SCRAPPED" && unit.status !== "LOST"
  )
  const performer = data.performer
    ? [data.performer.code, data.performer.name].filter(Boolean).join(" - ")
    : "Signed-in account name required"
  const movedUnitId = firstValue(params.moved)
  const requestedUnitId = firstValue(params.unitId)
  const movements = canViewStock ? data.companyMovements?.movements ?? [] : data.unitMovements.map((movement) => ({
    from: movement.fromHolder,
    kind: movement.movementType,
    occurredAt: movement.movedAt,
    performedBy: movement.movedBy,
    quantity: null,
    remark: movement.remark,
    storeName: null,
    subjectCode: movement.assetCode,
    to: movement.toHolder,
    typeCode: movement.typeCode,
    unitId: movement.assetCode,
    usedOn: null,
  }))

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        description="Record physical Unit ID movement or hand stock responsibility to another Store."
        icon={ArrowRightLeft}
        title="Movement"
      />

      {movedUnitId || firstValue(params.saved) === "1" ? (
        <p className="text-sm" role="status">
          {movedUnitId ? `Movement recorded for ${movedUnitId}.` : "Store transfer recorded."}
        </p>
      ) : null}

      {canMove ? (
        <StoreMovementWorkspace
          storageLocations={data.workspace.storageLocations}
          assets={canTransfer ? data.workspace.assets : []}
          canTransfer={canTransfer}
          consumables={canTransfer ? data.workspace.consumables : []}
          departments={data.departments}
          initialUnitId={movableUnits.some((unit) => unit.assetCode === requestedUnitId)
            ? requestedUnitId : ""}
          key={requestedUnitId}
          locations={data.locations.filter((location) => location.locationType === "STORE")}
          machines={data.machines}
          performer={performer}
          stores={canTransfer ? data.workspace.stores : []}
          units={movableUnits}
          vendors={data.vendors}
        />
      ) : null}

      <SectionCard>
        <CardHeader>
          <CardTitle>{canViewStock ? "Company movements" : "Recent Unit Movements"}</CardTitle>
          {canViewStock ? <p className="text-sm text-muted-foreground">
            All Stores. Signed Consumable quantities change stock at the listed Store;
            transfers cancel out in the company total.
          </p> : null}
        </CardHeader>
        <CardContent className="min-w-0">
          {canViewStock ? <form action="/store/movement" className="mb-4 flex flex-wrap items-center gap-2">
            <Input aria-label="Find Asset Code or Unit ID" className="w-64 max-w-full"
              defaultValue={code} name="code" placeholder="Find Asset Code or Unit ID" />
            <Button type="submit" variant="outline">Find</Button>
            {code ? <Button asChild variant="ghost"><Link href="/store/movement">Clear</Link></Button> : null}
          </form> : null}
          <OperationalTable filterStorageKey={canViewStock
            ? `store-company-movement-${code || "all"}-${page}`
            : "store-movement-unit-v3"}>
            <TableHeader>
              <TableRow>
                <TableHead>Recorded at</TableHead>
                <TableHead>Item / Unit ID</TableHead>
                <TableHead>Asset Code</TableHead>
                {canViewStock ? <TableHead>Store</TableHead> : null}
                <TableHead>Movement</TableHead>
                <TableHead>Quantity</TableHead>
                {canViewStock ? <TableHead>Used on</TableHead> : null}
                <TableHead>From</TableHead>
                <TableHead>To</TableHead>
                <TableHead>Recorded By</TableHead>
                <TableHead>Remark</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {movements.map((movement, index) => (
                <TableRow key={`${movement.subjectCode}-${movement.occurredAt}-${index}`}>
                  <TableCell>{formatIstDateTime(movement.occurredAt)}</TableCell>
                  <TableCell className="font-medium">
                    {movement.unitId ? (
                      <Link className="text-primary underline-offset-4 hover:underline"
                        href={`/store/assets/${encodeURIComponent(movement.unitId)}`}>
                        {movement.subjectCode}
                      </Link>
                    ) : movement.subjectCode}
                  </TableCell>
                  <TableCell>{movement.typeCode}</TableCell>
                  {canViewStock ? <TableCell>{movement.storeName}</TableCell> : null}
                  <TableCell><StatusBadge value={movementLabel(movement.kind)} /></TableCell>
                  <TableCell>{movement.quantity ?? "—"}</TableCell>
                  {canViewStock ? <TableCell>{movement.usedOn ? formatIstDate(movement.usedOn) : "—"}</TableCell> : null}
                  <TableCell>{movement.from || "—"}</TableCell>
                  <TableCell>{movement.to || "—"}</TableCell>
                  <TableCell>{movement.performedBy || "—"}</TableCell>
                  <TableCell>{movement.remark || "—"}</TableCell>
                </TableRow>
              ))}
              {!movements.length ? (
                <TableRow>
                  <TableCell className="h-24 text-center text-muted-foreground" colSpan={canViewStock ? 11 : 9}>
                    No movements recorded.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </OperationalTable>
          {canViewStock ? <p className="mt-2 text-xs text-muted-foreground">
            Column filters apply to this page only. Find searches the full history.
          </p> : null}
          {canViewStock ? <nav aria-label="Company movement pages"
            className="mt-4 flex items-center justify-end gap-2">
            {page > 1 ? <Button asChild size="sm" variant="outline">
              <Link href={movementPageHref(page - 1, code)}>Previous</Link>
            </Button> : null}
            <span className="text-sm text-muted-foreground">Page {page}</span>
            {data.companyMovements?.hasMore ? <Button asChild size="sm" variant="outline">
              <Link href={movementPageHref(page + 1, code)}>Next</Link>
            </Button> : null}
          </nav> : null}
        </CardContent>
      </SectionCard>
    </div>
  )
}
