import Link from "next/link"
import { createDepartmentStoreRepository, createStoreRepository } from "@workspace/db"
import { ArrowRightLeft } from "lucide-react"

import { StoreMovementWorkspace } from "@/components/store/store-movement-workspace"
import { PageHeader } from "@/components/ui/golden-patterns"
import { readAuthEnvironment } from "@/lib/auth/auth"
import { listGrantedCapabilities, requireCapability } from "@/lib/auth/require-capability"
import { listGrantedStoreActions } from "@/lib/auth/store-action-access"
import { signedInPerformer } from "@/lib/auth/signed-in-machinist"
import { formatIstDateTime } from "@/lib/date-time"
import { getWebPostgresPool } from "@/lib/postgres-runtime"

import { StatusBadge } from "@workspace/ui/components/badge"
import { CardContent, CardHeader, CardTitle, SectionCard } from "@workspace/ui/components/card"
import { OperationalTable, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@workspace/ui/components/table"

function firstValue(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value) ?? ""
}

function movementLabel(kind: string) {
  switch (kind) {
    case "ACCOUNTABILITY_TRANSFER": return "Responsibility transfer"
    case "TRANSFER": return "Quantity transfer"
    case "TRANSFER_OUT": return "Physical move out"
    case "TRANSFER_IN": return "Physical move in"
    case "ADJUSTMENT": return "Stock adjustment"
    default: return kind.replaceAll("_", " ")
  }
}

export default async function StoreMovementPage({
  searchParams,
}: {
  searchParams: Promise<{
    moved?: string | string[]
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
  const repository = createStoreRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const data = await (async () => {
    const organizationId = await repository.organizationIdForCode("MRMPL")
    const departmentRepository = createDepartmentStoreRepository({ pool: getWebPostgresPool() })
    const [workspace, units, vendors, locations, departments, machines, performer, unitMovements] = await Promise.all([
      departmentRepository.listStoreWorkspace({ organizationId, storeCode: "MAIN" }),
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
    return { workspace, units, vendors, locations, departments, machines, performer, unitMovements }
  })().finally(() => repository.close())
  const accountableUnitIds = new Set(data.workspace.assets.map((asset) => asset.assetCode))
  const movableUnits = data.units.filter(
    (unit) => accountableUnitIds.has(unit.assetCode) && unit.status !== "SCRAPPED"
  )
  const performer = data.performer
    ? [data.performer.code, data.performer.name].filter(Boolean).join(" - ")
    : "Signed-in account name required"
  const movedUnitId = firstValue(params.moved)
  const requestedUnitId = firstValue(params.unitId)
  const movements = canViewStock ? data.workspace.movements : data.unitMovements.map((movement) => ({
    from: movement.fromHolder,
    kind: movement.movementType,
    occurredAt: movement.movedAt,
    performedBy: movement.movedBy,
    quantity: null,
    remark: movement.remark,
    subjectCode: movement.assetCode,
    to: movement.toHolder,
    typeCode: movement.typeCode,
    unitId: movement.assetCode,
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
          <CardTitle>{canViewStock ? "Recent movements" : "Recent Unit Movements"}</CardTitle>
        </CardHeader>
        <CardContent className="min-w-0">
          <OperationalTable filterStorageKey="store-movement-record-v2">
            <TableHeader>
              <TableRow>
                <TableHead>Date & Time</TableHead>
                <TableHead>Item / Unit ID</TableHead>
                <TableHead>Asset Code</TableHead>
                <TableHead>Movement</TableHead>
                <TableHead>Quantity</TableHead>
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
                  <TableCell><StatusBadge value={movementLabel(movement.kind)} /></TableCell>
                  <TableCell>{movement.quantity ?? "—"}</TableCell>
                  <TableCell>{movement.from || "—"}</TableCell>
                  <TableCell>{movement.to || "—"}</TableCell>
                  <TableCell>{movement.performedBy || "—"}</TableCell>
                  <TableCell>{movement.remark || "—"}</TableCell>
                </TableRow>
              ))}
              {!movements.length ? (
                <TableRow>
                  <TableCell className="h-24 text-center text-muted-foreground" colSpan={9}>
                    No movements recorded.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </OperationalTable>
        </CardContent>
      </SectionCard>
    </div>
  )
}
