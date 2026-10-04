import Link from "next/link"
import { notFound } from "next/navigation"
import { ClipboardCheck } from "lucide-react"
import { createDepartmentStoreRepository, createStoreRepository } from "@workspace/db"
import { StatusBadge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { StandardState } from "@workspace/ui/components/standard-state"
import { OperationalTable, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@workspace/ui/components/table"

import { PageHeader } from "@/components/ui/golden-patterns"
import { readAuthEnvironment } from "@/lib/auth/auth"
import { accountableStoreHref, accountableStorePermission } from "@/lib/auth/department-store-capabilities"
import { listGrantedCapabilities, requireCapability } from "@/lib/auth/require-capability"
import { getWebPostgresPool } from "@/lib/postgres-runtime"

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

export default async function DepartmentCalibrationSelectionPage({ searchParams }: {
  searchParams: Promise<{ asset_code?: string | string[]; store?: string | string[] }>
}) {
  const params = await searchParams
  const storeCode = first(params.store) || ""
  let returnPath: string
  try {
    returnPath = accountableStoreHref(storeCode)
  } catch {
    notFound()
  }
  const session = await requireCapability(
    accountableStorePermission(storeCode, "write"), returnPath
  )
  const canOpenQc = (await listGrantedCapabilities(session.user.id, [
    "quality.control.calibration.read",
  ])).length > 0
  const repository = createStoreRepository({ connectionString: readAuthEnvironment().connectionString })
  const { organizationId, work } = await (async () => {
    const organizationId = await repository.organizationIdForCode("MRMPL")
    const work = await repository.listCalibrationWorklist({ organizationId, includeFuture: true })
    return { organizationId, work }
  })().finally(() => repository.close())
  const workspace = await createDepartmentStoreRepository({ pool: getWebPostgresPool() })
    .listStoreWorkspace({ organizationId, storeCode })
  const codes = new Set((Array.isArray(params.asset_code)
    ? params.asset_code : params.asset_code ? [params.asset_code] : [])
    .map((value) => value.trim().toLowerCase()))
  const selected = workspace.assets.filter((asset) =>
    asset.status !== "SCRAPPED" && codes.has(asset.assetCode.toLowerCase()))

  return <div className="grid min-w-0 gap-5">
    <PageHeader title="Calibration service" icon={ClipboardCheck}
      description={`Selected Unit IDs accountable to ${workspace.store.name}. Each Unit ID keeps its own visit, service PO and certificate.`}
      actions={<Button asChild variant="outline"><Link href={returnPath}>Back to Store</Link></Button>} />
    <OperationalTable filterStorageKey="department-store-selected-calibrations"
      containerClassName="rounded-md border"
      toolbarStart={<span className="font-medium">Selected Unit IDs</span>}>
      <TableHeader><TableRow>
        <TableHead>Unit ID</TableHead><TableHead>Asset</TableHead>
        <TableHead>Calibration</TableHead><TableHead>Store service</TableHead>
        <TableHead>Quality Control</TableHead>
      </TableRow></TableHeader>
      <TableBody>
        {selected.map((asset) => {
          const visits = work.filter((row) => row.unitId === asset.assetCode)
          const active = visits.find((row) => row.method === "SUPPLIER" &&
            ["OPEN", "DISPATCHED", "RETURNED"].includes(row.status))
          const inHouse = visits.some((row) => row.method === "IN_HOUSE" && row.status === "OPEN")
          return <TableRow key={asset.assetCode}>
            <TableCell className="font-medium">{asset.assetCode}</TableCell>
            <TableCell>{asset.assetName}</TableCell>
            <TableCell>{active ? <StatusBadge value={active.status} /> : inHouse
              ? "In-house visit in progress" : visits.length ? "QC visit needed" : "Timetable needed"}</TableCell>
            <TableCell>{active ? <Button asChild size="sm" variant="outline"><Link
              href={`/department-store/calibration/${encodeURIComponent(asset.assetCode)}?store=${encodeURIComponent(storeCode)}`}>
              Open service
            </Link></Button> : "—"}</TableCell>
            <TableCell>{canOpenQc ? <Button asChild size="sm" variant="outline"><Link
              href={`/quality-control/calibration?show=all&unit=${encodeURIComponent(asset.assetCode)}`}>
              Open in QC
            </Link></Button> : "QC access required"}</TableCell>
          </TableRow>
        })}
        {!selected.length ? <TableRow><TableCell colSpan={5}>
          <StandardState title="No Unit IDs selected"
            description="Select one or more eligible Unit IDs in the Store Stock table." />
        </TableCell></TableRow> : null}
      </TableBody>
    </OperationalTable>
  </div>
}
