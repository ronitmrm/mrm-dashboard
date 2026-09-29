import Link from "next/link"
import { createStoreRepository } from "@workspace/db"
import { ArrowRightLeft } from "lucide-react"

import { StoreMovementForm } from "@/components/store/store-movement-form"
import { PageHeader, FormSection } from "@/components/ui/golden-patterns"
import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"
import { listGrantedStoreActions } from "@/lib/auth/store-action-access"
import { signedInPerformer } from "@/lib/auth/signed-in-machinist"
import { formatIstDateTime } from "@/lib/date-time"

import { StatusBadge } from "@workspace/ui/components/badge"
import { CardContent, CardHeader, CardTitle, SectionCard } from "@workspace/ui/components/card"
import { OperationalTable, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@workspace/ui/components/table"

function firstValue(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value) ?? ""
}

export default async function StoreMovementPage({
  searchParams,
}: {
  searchParams: Promise<{ moved?: string | string[]; unitId?: string | string[] }>
}) {
  const session = await requireCapability("store.asset_history.read", "/store/movement")
  const canMove = (await listGrantedStoreActions(session.user.id)).has(
    "store.asset_movement.write"
  )
  const params = await searchParams
  const repository = createStoreRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const data = await (async () => {
    const organizationId = await repository.organizationIdForCode("MRMPL")
    const [units, vendors, locations, movements, performer] = await Promise.all([
      repository.listAssets({ organizationId }),
      canMove ? repository.listVendors(organizationId) : Promise.resolve([]),
      canMove ? repository.listLocations(organizationId) : Promise.resolve([]),
      repository.listRecentAssetMovements(organizationId),
      canMove
        ? signedInPerformer({
            connectionString: readAuthEnvironment().connectionString,
            organizationId,
            userId: session.user.id,
            userName: session.user.name,
          })
        : Promise.resolve(null),
    ])
    return { units, vendors, locations, movements, performer }
  })().finally(() => repository.close())
  const movableUnits = data.units.filter((unit) => unit.status !== "SCRAPPED")
  const performer = data.performer
    ? [data.performer.code, data.performer.name].filter(Boolean).join(" - ")
    : "Signed-in account name required"
  const movedUnitId = firstValue(params.moved)
  const requestedUnitId = firstValue(params.unitId)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        description="Move a physical Unit ID to a Vendor, Machine, or Department, or return it to Store. No request is needed."
        icon={ArrowRightLeft}
        title="Movement"
      />

      {movedUnitId ? (
        <p className="text-sm" role="status">
          Movement recorded for {movedUnitId}.
        </p>
      ) : null}

      {canMove ? (
        <FormSection
          description="Select the Unit ID and its destination. The current holder changes when you record the move."
          title="Record Movement"
          width="standard"
        >
          <StoreMovementForm
            initialUnitId={
              movableUnits.some((unit) => unit.assetCode === requestedUnitId)
                ? requestedUnitId
                : ""
            }
            locations={data.locations.filter(
              (location) => location.locationType === "STORE"
            )}
            performer={performer}
            units={movableUnits}
            vendors={data.vendors}
          />
        </FormSection>
      ) : null}

      <SectionCard>
        <CardHeader>
          <CardTitle>Recent Unit Movements</CardTitle>
        </CardHeader>
        <CardContent className="min-w-0">
          <OperationalTable filterStorageKey="store-unit-movement-record-v1">
            <TableHeader>
              <TableRow>
                <TableHead>Date & Time</TableHead>
                <TableHead>Unit ID</TableHead>
                <TableHead>Asset Code</TableHead>
                <TableHead>Movement</TableHead>
                <TableHead>From</TableHead>
                <TableHead>Destination</TableHead>
                <TableHead>Moved By</TableHead>
                <TableHead>Remark</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.movements.map((movement, index) => (
                <TableRow key={`${movement.assetCode}-${movement.movedAt.toISOString()}-${index}`}>
                  <TableCell>{formatIstDateTime(movement.movedAt)}</TableCell>
                  <TableCell>
                    <Link
                      className="font-medium text-primary underline-offset-4 hover:underline"
                      href={`/store/assets/${encodeURIComponent(movement.assetCode)}`}
                    >
                      {movement.assetCode}
                    </Link>
                  </TableCell>
                  <TableCell>{movement.typeCode}</TableCell>
                  <TableCell><StatusBadge value={movement.movementType} /></TableCell>
                  <TableCell>{movement.fromHolder || "—"}</TableCell>
                  <TableCell>{movement.toHolder || "—"}</TableCell>
                  <TableCell>{movement.movedBy || "—"}</TableCell>
                  <TableCell>{movement.remark || "—"}</TableCell>
                </TableRow>
              ))}
              {!data.movements.length ? (
                <TableRow>
                  <TableCell className="h-24 text-center text-muted-foreground" colSpan={8}>
                    No Unit ID movements recorded.
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
