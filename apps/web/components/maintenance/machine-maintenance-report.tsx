import { createMaintenanceRepository, type MaintenanceWorkPhotoTarget } from "@workspace/db"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { StatusBadge } from "@workspace/ui/components/badge"
import {
  OperationalTable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { StandardState } from "@workspace/ui/components/standard-state"

import { MetricSummary, PageHeader } from "@/components/ui/golden-patterns"
import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"
import { formatIstDate, formatIstDateTime, istDateValue } from "@/lib/date-time"
import {
  machineMaintenancePlan,
  machineMaintenanceRegister,
} from "@/lib/iso-documents"
import { maintenanceWorkPhotoQuery } from "@/lib/maintenance-work-photo-target"
import { planDateRange } from "@/lib/plan-date-range"

async function readReportRows(isPlan: boolean, from: string, to: string) {
  const repository = createMaintenanceRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  return (async () => {
    const organizationId = await repository.organizationIdForCode("MRMPL")
    if (isPlan) {
      const [machines, assets] = await Promise.all([
        repository.listMachineMaintenancePlan(organizationId, from, to),
        repository.listAssetMaintenancePlan(organizationId, from, to),
      ])
      return [
        ...machines.map((row) => ({ ...row, assetCode: null as string | null,
          assetName: null as string | null, taskType: "Planned",
          completedBy: null, workDone: null, legacyHistory: false,
          photos: [] as Array<{ id: string; fileName: string }>,
          photoTarget: null as MaintenanceWorkPhotoTarget | null })),
        ...assets.map((row) => ({ ...row, machineNumber: null as string | null,
          assetCode: row.assetCode, taskType: "Planned",
          completedBy: null, workDone: null, legacyHistory: false,
          photos: [] as Array<{ id: string; fileName: string }>,
          photoTarget: null as MaintenanceWorkPhotoTarget | null })),
      ].sort((left, right) => left.dueOn.localeCompare(right.dueOn) ||
        (left.machineNumber ?? left.assetCode ?? "").localeCompare(right.machineNumber ?? right.assetCode ?? ""))
    }
    const [machines, assets] = await Promise.all([
      repository.listCompletedMachineMaintenance(organizationId),
      repository.listCompletedAssetMaintenance(organizationId),
    ])
    return [
      ...machines.map((row) => ({ ...row, assetCode: null as string | null,
        assetName: null as string | null, status: "Completed",
        photoTarget: { kind: "machine", taskKey: row.taskKey } as MaintenanceWorkPhotoTarget })),
      ...assets.map((row) => ({ ...row, machineNumber: null as string | null,
        status: "Completed",
        photoTarget: (row.breakdownId
          ? { kind: "asset-breakdown", breakdownId: row.breakdownId }
          : row.scheduleId && row.dueOn
            ? { kind: "asset-planned", scheduleId: row.scheduleId, dueOn: row.dueOn }
            : null) as MaintenanceWorkPhotoTarget | null })),
    ].sort((left, right) => right.completedAt.localeCompare(left.completedAt))
  })().finally(() => repository.close())
}

export async function MachineMaintenanceReport({
  mode,
  from: requestedFrom,
  to: requestedTo,
  month: requestedMonth,
}: {
  mode: "completed" | "plan"
  from?: string
  to?: string
  month?: string
}) {
  const document =
    mode === "plan" ? machineMaintenancePlan : machineMaintenanceRegister
  await requireCapability("maintenance.workspace.read", document.href)
  const { from, to } = planDateRange(requestedFrom, requestedTo, requestedMonth)
  const rows = await readReportRows(mode === "plan", from, to)
  return <MachineMaintenanceReportView mode={mode} from={from} to={to} rows={rows} />
}

export function MachineMaintenanceReportView({
  mode,
  from,
  to,
  rows,
}: {
  mode: "completed" | "plan"
  from: string
  to: string
  rows: Awaited<ReturnType<typeof readReportRows>>
}) {
  const isPlan = mode === "plan"
  const document = isPlan ? machineMaintenancePlan : machineMaintenanceRegister
  const equipment = new Set(
    rows.map((row) => row.machineNumber ?? row.assetCode)
  ).size
  const today = istDateValue()
  const pending = rows.filter((row) => row.status !== "Completed").length
  const overdue = rows.filter((row) =>
    row.status !== "Completed" && row.dueOn !== null && row.dueOn < today
  ).length
  const completed = rows.filter((row) => row.status === "Completed").length

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title={document.title}
        description={
          isPlan
            ? "Saved machine and asset maintenance due dates. Completed planned work stays on its original due date."
            : "Completed machine and asset planned maintenance and breakdown repairs. One row per completed job."
        }
      />
      {isPlan ? (
        <form action={document.href} className="flex flex-wrap items-end gap-3">
          <div className="grid gap-2">
            <Label htmlFor="maintenance-from">From</Label>
            <Input
              id="maintenance-from"
              name="from"
              type="date"
              defaultValue={from}
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="maintenance-to">To</Label>
            <Input
              id="maintenance-to"
              name="to"
              type="date"
              min={from}
              defaultValue={to}
              required
            />
          </div>
          <Button type="submit">Show Plan</Button>
        </form>
      ) : null}
      <MetricSummary
        scope={`${isPlan ? `${formatIstDate(from)} – ${formatIstDate(to)}` : "All completed work"} · before table filters`}
        items={isPlan ? [
          { label: "Scheduled Jobs", value: rows.length, tone: "information" },
          { label: "Awaiting Maintenance", value: pending, tone: "warning" },
          { label: "Overdue", value: overdue, tone: "danger" },
          { label: "Completed", value: completed, tone: "positive" },
        ] : [
          {
            label: "Completed Jobs",
            value: rows.length,
            tone: "information",
          },
          { label: "Machines / Assets", value: equipment, tone: "information" },
        ]}
      />
      <OperationalTable
        filterStorageKey={`iso-maintenance-${mode}`}
        containerClassName="rounded-md border"
        toolbarStart={
          <span className="font-medium">
            {isPlan ? "Maintenance Plan" : "Completed Maintenance"}
          </span>
        }
      >
        <TableHeader>
          <TableRow>
            <TableHead>{isPlan ? "Planned Date" : "Completed At"}</TableHead>
            <TableHead>Machine No. / Asset Code</TableHead>
            <TableHead>Production Unit / Location</TableHead>
            <TableHead>Maintenance</TableHead>
            {isPlan ? (
              <>
                <TableHead>Status</TableHead>
                <TableHead>Completed At</TableHead>
              </>
            ) : (
              <>
                <TableHead>Type</TableHead>
                <TableHead>Completed By</TableHead>
                <TableHead>Work Done</TableHead>
                <TableHead>Photos</TableHead>
              </>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="whitespace-nowrap">
                {isPlan
                  ? formatIstDate(row.dueOn)
                  : row.legacyHistory
                    ? formatIstDate(row.completedAt)
                    : formatIstDateTime(row.completedAt)}
              </TableCell>
              <TableCell>{row.machineNumber ?? row.assetCode}</TableCell>
              <TableCell>{row.productionUnit}</TableCell>
              <TableCell>{row.maintenance}</TableCell>
              {isPlan ? (
                <>
                  <TableCell>
                    <StatusBadge value={row.status} />
                  </TableCell>
                  <TableCell>{formatIstDateTime(row.completedAt)}</TableCell>
                </>
              ) : (
                <>
                  <TableCell>{row.taskType}</TableCell>
                  <TableCell>{row.completedBy || "-"}</TableCell>
                  <TableCell className="whitespace-normal">
                    {row.workDone || "-"}
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    {row.photoTarget && row.photos.length
                      ? row.photos.map((photo, index) => (
                        <span key={photo.id}>
                          {index ? ", " : ""}
                          <a className="underline underline-offset-4" href={`/api/maintenance/work-photos/${photo.id}?${maintenanceWorkPhotoQuery(row.photoTarget!)}`} rel="noopener noreferrer" target="_blank">{photo.fileName}</a>
                        </span>
                      ))
                      : "-"}
                  </TableCell>
                </>
              )}
            </TableRow>
          ))}
          {!rows.length ? (
            <TableRow>
              <TableCell colSpan={isPlan ? 6 : 8}>
                <StandardState
                  title={
                    isPlan
                      ? "No maintenance planned for this date range"
                      : "No completed maintenance"
                  }
                  description={
                    isPlan
                      ? "Saved maintenance due dates in the selected date range will appear here."
                      : "Completed planned jobs and breakdown repairs will appear here automatically."
                  }
                />
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </OperationalTable>
    </div>
  )
}
