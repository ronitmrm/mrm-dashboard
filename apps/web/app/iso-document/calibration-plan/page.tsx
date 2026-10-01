import { createStoreRepository } from "@workspace/db"
import { redirect } from "next/navigation"
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
import { AttachmentViewerLink } from "@/components/attachment-viewer-link"
import { readAuthEnvironment } from "@/lib/auth/auth"
import {
  listGrantedCapabilities,
  requireAuthenticatedSession,
} from "@/lib/auth/require-capability"
import { formatIstDate, istDateValue } from "@/lib/date-time"
import { calibrationPlan } from "@/lib/iso-documents"
import { planDateRange } from "@/lib/plan-date-range"

export default async function CalibrationPlanPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; month?: string }>
}) {
  const session = await requireAuthenticatedSession(calibrationPlan.href)
  const grants = await listGrantedCapabilities(session.user.id, [
    "iso.calibration_plan.read",
    "store.stock.read",
    "quality.control.calibration.read",
  ])
  if (!grants.length) redirect("/unauthorized")
  const params = await searchParams
  const { from, to } = planDateRange(params.from, params.to, params.month)
  const repository = createStoreRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const rows = await (async () => {
    const organizationId = await repository.organizationIdForCode("MRMPL")
    return repository.listCalibrationPlan(organizationId, from, to)
  })().finally(() => repository.close())
  const today = istDateValue()
  const due = rows.filter((row) => ["Planned", "OPEN", "DISPATCHED", "RETURNED", "FAILED"].includes(row.status)).length
  const overdue = rows.filter((row) =>
    (row.status === "Planned" || row.status === "OPEN" || row.status === "FAILED") && row.dueOn < today
  ).length
  const passed = rows.filter((row) => row.status === "PASSED").length

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title={calibrationPlan.title}
        description="Calibration due dates, completion dates and certificates for each Unit ID. Completed work stays on its original due date."
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
          { label: "Pending / Corrective", value: due, tone: "warning" },
          { label: "Overdue", value: overdue, tone: "danger" },
          { label: "Passed", value: passed, tone: "positive" },
        ]}
      />
      <OperationalTable
        filterStorageKey="iso-calibration-plan"
        containerClassName="rounded-md border"
        toolbarStart={<span className="font-medium">Calibration Plan</span>}
      >
        <TableHeader>
          <TableRow>
            <TableHead>Due Date</TableHead>
            <TableHead>Unit ID</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Subcategory</TableHead>
            <TableHead>Asset</TableHead>
            <TableHead>Calibration</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Supplier</TableHead>
            <TableHead>Completed On</TableHead>
            <TableHead>Certificate</TableHead>
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
                  {row.visitId && row.certificateFileName ? (
                    <Button asChild size="sm" variant="outline">
                      <AttachmentViewerLink
                        fileName={row.certificateFileName}
                        href={`/store/assets/${encodeURIComponent(row.unitId)}/calibrations/${encodeURIComponent(row.visitId)}/certificate`}
                        mediaType="application/pdf"
                      >
                        View certificate
                      </AttachmentViewerLink>
                    </Button>
                  ) : "—"}
                </TableCell>
              </TableRow>
            )
          })}
          {!rows.length ? (
            <TableRow>
              <TableCell colSpan={10}>
                <StandardState
                  title="No calibration planned for this date range"
                  description="Assigned Unit ID timetables and completed visits will appear here."
                />
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </OperationalTable>
    </div>
  )
}
