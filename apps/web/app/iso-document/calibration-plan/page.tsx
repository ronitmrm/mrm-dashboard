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
import { storeAssetCalibrationHref } from "@/lib/store-asset-workspace"

export default async function CalibrationPlanPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const session = await requireCapability("store.stock.read", calibrationPlan.href)
  const { month: requestedMonth } = await searchParams
  const month =
    requestedMonth && /^\d{4}-(0[1-9]|1[0-2])$/.test(requestedMonth)
      ? requestedMonth
      : istDateValue().slice(0, 7)
  const canOpen = (
    await listGrantedCapabilities(session.user.id, ["store.asset_history.read"])
  ).includes("store.asset_history.read")
  const repository = createStoreRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const rows = await (async () => {
    const organizationId = await repository.organizationIdForCode("MRMPL")
    return repository.listCalibrationPlan(organizationId, month)
  })().finally(() => repository.close())
  const units = new Set(rows.map((row) => row.unitId)).size
  const today = istDateValue()

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title={calibrationPlan.title}
        description="Saved calibration due dates for all Store Unit IDs. Completed visits stay in their original due month."
        actions={
          <Button asChild variant="outline">
            <Link href="/store/stock">Store Stock</Link>
          </Button>
        }
      />
      <form action={calibrationPlan.href} className="flex flex-wrap items-end gap-3">
        <div className="grid gap-2">
          <Label htmlFor="calibration-month">Plan month</Label>
          <Input
            id="calibration-month"
            name="month"
            type="month"
            defaultValue={month}
            required
          />
        </div>
        <Button type="submit">Show Plan</Button>
      </form>
      <MetricSummary
        scope={`${month} · all Store Unit IDs · before table filters`}
        items={[
          { label: "Calibration Rows", value: rows.length, tone: "information" },
          { label: "Unit IDs", value: units, tone: "information" },
        ]}
      />
      <OperationalTable
        filterStorageKey="iso-calibration-plan"
        containerClassName="rounded-md border"
        toolbarStart={<span className="font-medium">Monthly Plan</span>}
      >
        <TableHeader>
          <TableRow>
            <TableHead>Due Date</TableHead>
            <TableHead>Unit ID</TableHead>
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
              <TableRow key={row.id}>
                <TableCell className="whitespace-nowrap">
                  {formatIstDate(row.dueOn)}
                </TableCell>
                <TableCell className="font-medium">{row.unitId}</TableCell>
                <TableCell>{row.typeCode} · {row.assetName}</TableCell>
                <TableCell>{row.scheduleName}</TableCell>
                <TableCell><StatusBadge tone={tone} value={status} /></TableCell>
                <TableCell>{row.supplierName || "-"}</TableCell>
                <TableCell>{formatIstDate(row.completedOn)}</TableCell>
                <TableCell>
                  {canOpen ? (
                    <Button asChild size="sm" variant="outline">
                      <Link href={storeAssetCalibrationHref(row.unitId)}>
                        Open Calibration
                      </Link>
                    </Button>
                  ) : (
                    "Store access required"
                  )}
                </TableCell>
              </TableRow>
            )
          })}
          {!rows.length ? (
            <TableRow>
              <TableCell colSpan={8}>
                <StandardState
                  title="No calibration planned for this month"
                  description="Assign a calibration timetable to a physical Unit ID in Store; saved due dates and visits will appear here."
                />
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </OperationalTable>
    </div>
  )
}
