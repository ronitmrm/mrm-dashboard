import Link from "next/link"
import { notFound } from "next/navigation"
import { Gauge } from "lucide-react"
import { createDepartmentStoreRepository, createStoreRepository } from "@workspace/db"
import { StatusBadge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { CardContent, CardHeader, CardTitle, SectionCard } from "@workspace/ui/components/card"
import { OperationalTable, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@workspace/ui/components/table"

import { AttachmentViewerLink } from "@/components/attachment-viewer-link"
import { PageHeader } from "@/components/ui/golden-patterns"
import { readAuthEnvironment } from "@/lib/auth/auth"
import { accountableStoreHref, accountableStorePermission } from "@/lib/auth/department-store-capabilities"
import { requireCapability } from "@/lib/auth/require-capability"
import { formatIstDate, formatIstDateTime } from "@/lib/date-time"
import { getWebPostgresPool } from "@/lib/postgres-runtime"

export default async function DepartmentStoreAssetHistoryPage({ params, searchParams }: {
  params: Promise<{ unitId: string }>
  searchParams: Promise<{ store?: string }>
}) {
  const { unitId } = await params
  const storeCode = (await searchParams).store || ""
  let backPath: string
  try {
    backPath = accountableStoreHref(storeCode)
  } catch {
    notFound()
  }
  await requireCapability(
    accountableStorePermission(storeCode, "read"),
    `/department-store/assets/${encodeURIComponent(unitId)}?store=${encodeURIComponent(storeCode)}`
  )
  const repository = createStoreRepository({ connectionString: readAuthEnvironment().connectionString })
  const departmentRepository = createDepartmentStoreRepository({ pool: getWebPostgresPool() })
  const data = await (async () => {
    const organizationId = await repository.organizationIdForCode("MRMPL")
    const accountability = await departmentRepository.getAssetAccountability(organizationId, unitId)
    if (accountability?.accountableStoreCode !== storeCode) return null
    const [workspace, transfers] = await Promise.all([
      repository.getAssetWorkspace({ assetCode: unitId, organizationId }),
      departmentRepository.listAssetAccountabilityTransfers({ assetCode: unitId, organizationId }),
    ])
    const current = await departmentRepository.getAssetAccountability(organizationId, unitId)
    return current?.accountableStoreCode === storeCode && workspace
      ? { workspace, transfers, accountableStoreName: current.accountableStoreName }
      : null
  })().finally(() => repository.close())
  if (!data) notFound()
  const { asset, movements, schedules, calibrationVisits } = data.workspace

  return <div className="grid min-w-0 gap-5">
    <PageHeader
      title={asset.assetCode}
      description={`${asset.typeCode} · ${asset.assetName} · Accountable to ${data.accountableStoreName}`}
      icon={Gauge}
      badge={<StatusBadge value={asset.status} />}
      actions={<Button asChild size="sm" variant="outline"><Link href={backPath}>Back to Store</Link></Button>}
    />
    <SectionCard>
      <CardHeader><CardTitle>Identity and custody</CardTitle></CardHeader>
      <CardContent className="grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-3">
        <div><div className="text-muted-foreground">Unit ID</div><div className="font-medium">{asset.assetCode}</div></div>
        <div><div className="text-muted-foreground">Manufacturer ID</div><div className="font-medium">{asset.manufacturerSerialNumber || "—"}</div></div>
        <div><div className="text-muted-foreground">Current physical holder</div><div className="font-medium">{asset.holderName || asset.locationName || asset.holderType}</div></div>
      </CardContent>
    </SectionCard>
    <SectionCard>
      <CardHeader><CardTitle>Calibration timetable and visits</CardTitle></CardHeader>
      <CardContent className="grid min-w-0 gap-4">
        <OperationalTable filterStorageKey={`department-asset-calibration-${asset.assetCode}`}>
          <TableHeader><TableRow>
            <TableHead>Schedule</TableHead><TableHead>Due</TableHead><TableHead>Last completed</TableHead><TableHead>Frequency</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {schedules.filter((schedule) => schedule.scheduleType === "CALIBRATION").map((schedule) =>
              <TableRow key={schedule.id}>
                <TableCell>{schedule.name}</TableCell>
                <TableCell>{formatIstDate(schedule.nextDueOn)}</TableCell>
                <TableCell>{schedule.lastCompletedOn ? formatIstDate(schedule.lastCompletedOn) : "—"}</TableCell>
                <TableCell>{schedule.frequencyDays} days</TableCell>
              </TableRow>)}
            {!schedules.some((schedule) => schedule.scheduleType === "CALIBRATION") ?
              <TableRow><TableCell colSpan={4}>No calibration timetable assigned.</TableCell></TableRow> : null}
          </TableBody>
        </OperationalTable>
        <OperationalTable filterStorageKey={`department-asset-calibration-visits-${asset.assetCode}`}>
          <TableHeader><TableRow>
            <TableHead>Due</TableHead><TableHead>Scope</TableHead><TableHead>Method</TableHead>
            <TableHead>Status</TableHead><TableHead>Result</TableHead><TableHead>Completed</TableHead>
            <TableHead>Certificate no.</TableHead><TableHead>Certificate</TableHead><TableHead>Supplier / PO</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {calibrationVisits.map((visit) => <TableRow key={visit.id}>
              <TableCell>{formatIstDate(visit.dueOn)}</TableCell>
              <TableCell>{visit.scope}</TableCell>
              <TableCell>{visit.method === "IN_HOUSE" ? "In-house" : "Supplier"}</TableCell>
              <TableCell><StatusBadge value={visit.status} /></TableCell>
              <TableCell>{visit.result || "—"}</TableCell>
              <TableCell>{visit.completedOn ? formatIstDate(visit.completedOn) : "—"}</TableCell>
              <TableCell>{visit.certificateNumber || "—"}</TableCell>
              <TableCell>{visit.certificateFileName ? <AttachmentViewerLink
                fileName={visit.certificateFileName}
                href={`/store/assets/${encodeURIComponent(asset.assetCode)}/calibrations/${encodeURIComponent(visit.id)}/certificate`}
              /> : "—"}</TableCell>
              <TableCell>{[visit.supplierName, visit.purchaseOrderNumber].filter(Boolean).join(" · ") || "—"}</TableCell>
            </TableRow>)}
            {!calibrationVisits.length ? <TableRow><TableCell colSpan={9}>No completed or active calibration visits.</TableCell></TableRow> : null}
          </TableBody>
        </OperationalTable>
      </CardContent>
    </SectionCard>
    <SectionCard>
      <CardHeader><CardTitle>Physical movement history</CardTitle></CardHeader>
      <CardContent className="min-w-0">
        <OperationalTable filterStorageKey={`department-asset-movements-${asset.assetCode}`}>
          <TableHeader><TableRow>
            <TableHead>Date & time</TableHead><TableHead>Movement</TableHead><TableHead>From</TableHead>
            <TableHead>To</TableHead><TableHead>Moved by</TableHead><TableHead>Note</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {movements.map((movement, index) => <TableRow key={`${movement.movedAt.toISOString()}-${index}`}>
              <TableCell>{formatIstDateTime(movement.movedAt)}</TableCell>
              <TableCell><StatusBadge value={movement.movementType} /></TableCell>
              <TableCell>{movement.fromHolder || "—"}</TableCell>
              <TableCell>{movement.toHolder || "—"}</TableCell>
              <TableCell>{movement.movedBy || "—"}</TableCell>
              <TableCell>{movement.remark || "—"}</TableCell>
            </TableRow>)}
            {!movements.length ? <TableRow><TableCell colSpan={6}>No physical movement recorded.</TableCell></TableRow> : null}
          </TableBody>
        </OperationalTable>
      </CardContent>
    </SectionCard>
    <SectionCard>
      <CardHeader><CardTitle>Accountability transfer history</CardTitle></CardHeader>
      <CardContent className="min-w-0">
        <OperationalTable filterStorageKey={`department-asset-accountability-${asset.assetCode}`}>
          <TableHeader><TableRow><TableHead>Date & time</TableHead><TableHead>From Store</TableHead>
            <TableHead>To Store</TableHead><TableHead>Transferred by</TableHead><TableHead>Note</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {data.transfers.map((transfer, index) => <TableRow key={`${transfer.transferredAt}-${index}`}>
              <TableCell>{formatIstDateTime(transfer.transferredAt)}</TableCell>
              <TableCell>{transfer.fromStore}</TableCell>
              <TableCell>{transfer.toStore}</TableCell>
              <TableCell>{transfer.transferredBy || "—"}</TableCell>
              <TableCell>{transfer.remark || "—"}</TableCell>
            </TableRow>)}
            {!data.transfers.length ? <TableRow><TableCell colSpan={5}>No accountability transfer recorded.</TableCell></TableRow> : null}
          </TableBody>
        </OperationalTable>
      </CardContent>
    </SectionCard>
  </div>
}
