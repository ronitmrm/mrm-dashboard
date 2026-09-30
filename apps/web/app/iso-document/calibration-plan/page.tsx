import Link from "next/link"

import { createStoreRepository } from "@workspace/db"
import { StatusBadge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { StandardState } from "@workspace/ui/components/standard-state"
import {
  OperationalTable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import { MetricSummary, PageHeader } from "@/components/ui/golden-patterns"
import { readAuthEnvironment } from "@/lib/auth/auth"
import {
  listGrantedCapabilities,
  requireCapability,
} from "@/lib/auth/require-capability"
import { formatIstDate, istDateValue } from "@/lib/date-time"
import { calibrationPlan } from "@/lib/iso-documents"
import { planDateRange } from "@/lib/plan-date-range"
import { storeAssetCalibrationHref } from "@/lib/store-asset-workspace"

export default async function CalibrationPlanPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; month?: string }>
}) {
  const session = await requireCapability("store.stock.read", calibrationPlan.href)
  const params = await searchParams
  const { from, to } = planDateRange(params.from, params.to, params.month)
  const grants = await listGrantedCapabilities(session.user.id, [
    "store.asset_history.read", "store.asset_maintenance.write",
  ])
  const canOpen = grants.includes("store.asset_history.read")
  const canManage = canOpen && grants.includes("store.asset_maintenance.write")
  const repository = createStoreRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const rows = await (async () => {
    const organizationId = await repository.organizationIdForCode("MRMPL")
    return repository.listCalibrationPlan(organizationId, from, to)
  })().finally(() => repository.close())
  const today = istDateValue()
  const due = rows.filter((row) => ["Planned", "OPEN", "DISPATCHED", "RETURNED"].includes(row.status)).length
  const overdue = rows.filter((row) =>
    (row.status === "Planned" || row.status === "OPEN") && row.dueOn < today
  ).length
  const passed = rows.filter((row) => row.status === "PASSED").length

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title={calibrationPlan.title}
        description="Saved calibration due dates for Store Unit IDs. Completed visits stay on their original due date."
        actions={
          <Button asChild variant="outline">
            <Link href="/store/stock">Store Stock</Link>
          </Button>
        }
      />
      <form action={calibrationPlan.href} className="flex flex-wrap items-end gap-3">
        <div className="grid gap-2">
          <Label htmlFor="calibration-from">From</Label>
          <Input
            id="calibration-from"
            name="from"
            type="date"
            defaultValue={from}
            required
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="calibration-to">To</Label>
          <Input
            id="calibration-to"
            name="to"
            type="date"
            min={from}
            defaultValue={to}
            required
          />
        </div>
        <Button type="submit">Show Plan</Button>
      </form>
      <MetricSummary
        scope={`${formatIstDate(from)} – ${formatIstDate(to)} · before table filters`}
        items={[
          { label: "Scheduled", value: rows.length, tone: "information" },
          { label: "Open / Planned", value: due, tone: "warning" },
          { label: "Overdue", value: overdue, tone: "danger" },
          { label: "Passed", value: passed, tone: "positive" },
        ]}
      />
      <form action="/store/calibration-dispatch" method="get">
      <OperationalTable
        filterStorageKey="iso-calibration-plan"
        containerClassName="rounded-md border"
        toolbarStart={
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-medium">Calibration Plan</span>
            {canManage ? <Button size="sm" type="submit">Send selected for calibration</Button> : null}
          </div>
        }
        filteredSelection={canManage ? { checkboxName: "unitId" } : undefined}
      >
        <TableHeader>
          <TableRow>
            {canManage ? <TableHead>Select</TableHead> : null}
            <TableHead>Due Date</TableHead>
            <TableHead>Unit ID</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Subcategory</TableHead>
            <TableHead>Asset</TableHead>
            <TableHead>Calibration</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Supplier</TableHead>
            <TableHead>Completed On</TableHead>
            <TableHead>Store Flow</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const status =
              row.status === "Planned" && row.dueOn < today
                ? "Overdue"
                : row.status
            const tone =
              status === "PASSED"
                ? "positive"
                : status === "FAILED" || status === "Overdue"
                  ? "danger"
                  : status === "Planned"
                    ? "information"
                    : "warning"
            return (
              <TableRow key={row.id} data-row-id={row.id}>
                {canManage ? <TableCell><input
                  aria-label={`Select ${row.unitId}`}
                  disabled={row.status !== "Planned" &&
                    !(row.status === "OPEN" && row.method === "SUPPLIER")}
                  name="unitId"
                  type="checkbox"
                  value={row.unitId}
                /></TableCell> : null}
                <TableCell className="whitespace-nowrap">
                  {formatIstDate(row.dueOn)}
                </TableCell>
                <TableCell className="font-medium">{row.unitId}</TableCell>
                <TableCell>{row.category}</TableCell>
                <TableCell>{row.subcategory}</TableCell>
                <TableCell>{row.typeCode} · {row.assetName}</TableCell>
                <TableCell>{row.scheduleName}</TableCell>
                <TableCell><StatusBadge tone={tone} value={status} /></TableCell>
                <TableCell>{row.supplierName || "-"}</TableCell>
                <TableCell>{formatIstDate(row.completedOn)}</TableCell>
                <TableCell>
                  {canOpen ? (
                    <div className="flex flex-wrap gap-2">
                      <Button asChild size="sm" variant="outline">
                        <Link href={storeAssetCalibrationHref(row.unitId)}>Open Calibration</Link>
                      </Button>
                      {canManage && (row.status === "Planned" || row.status === "FAILED" ||
                        (row.method === "IN_HOUSE" && row.status === "OPEN")) ? (
                        <Button asChild size="sm" variant="outline">
                          <Link href={row.status === "Planned" || row.status === "FAILED"
                            ? `${storeAssetCalibrationHref(row.unitId)}&inHouseScheduleId=${encodeURIComponent(row.scheduleId)}`
                            : storeAssetCalibrationHref(row.unitId)}>
                            {row.status === "Planned" ? "Calibrate In House"
                              : row.status === "FAILED" ? "Retry In House" : "Continue In House"}
                          </Link>
                        </Button>
                      ) : null}
                    </div>
                  ) : (
                    "Store access required"
                  )}
                </TableCell>
              </TableRow>
            )
          })}
          {!rows.length ? (
            <TableRow>
              <TableCell colSpan={canManage ? 11 : 10}>
                <StandardState
                  title="No calibration planned for this date range"
                  description="Assign a calibration timetable to a physical Unit ID in Store; saved due dates and visits will appear here."
                />
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </OperationalTable>
      </form>
    </div>
  )
}
