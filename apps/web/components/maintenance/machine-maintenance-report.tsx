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

async function readReportRows(isPlan: boolean, month: string) {
  const repository = createMaintenanceRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  return (async () => {
    const organizationId = await repository.organizationIdForCode("MRMPL")
    if (isPlan) {
      const [machines, assets] = await Promise.all([
        repository.listMachineMaintenancePlan(organizationId, month),
        repository.listAssetMaintenancePlan(organizationId, month),
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
  month: requestedMonth,
}: {
  mode: "completed" | "plan"
  month?: string
}) {
  const document =
    mode === "plan" ? machineMaintenancePlan : machineMaintenanceRegister
  await requireCapability("maintenance.workspace.read", document.href)
  const month =
    requestedMonth && /^\d{4}-(0[1-9]|1[0-2])$/.test(requestedMonth)
      ? requestedMonth
      : istDateValue().slice(0, 7)
  const rows = await readReportRows(mode === "plan", month)
  return <MachineMaintenanceReportView mode={mode} month={month} rows={rows} />
}

export function MachineMaintenanceReportView({
  mode,
  month,
  rows,
}: {
  mode: "completed" | "plan"
  month: string
  rows: Awaited<ReturnType<typeof readReportRows>>
}) {
  const isPlan = mode === "plan"
  const document = isPlan ? machineMaintenancePlan : machineMaintenanceRegister
  const equipment = new Set(
    rows.map((row) => row.machineNumber ?? row.assetCode)
  ).size

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title={document.title}
        description={
          isPlan
            ? "Saved machine and asset maintenance due dates for the month. Completed planned work stays in its due month."
            : "Completed machine and asset planned maintenance and breakdown repairs. One row per completed job."
        }
      />
      {isPlan ? (
        <form action={document.href} className="flex flex-wrap items-end gap-3">
          <div className="grid gap-2">
            <Label htmlFor="maintenance-month">Plan month</Label>
            <Input
              id="maintenance-month"
              name="month"
              type="month"
              defaultValue={month}
              required
            />
          </div>
          <Button type="submit">Show Plan</Button>
        </form>
      ) : null}
      <MetricSummary
        scope={`${isPlan ? month : "All completed work"} · before table filters`}
        items={[
          {
            label: isPlan ? "Planned Jobs" : "Completed Jobs",
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
            {isPlan ? "Monthly Plan" : "Completed Maintenance"}
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
                      ? "No maintenance planned for this month"
                      : "No completed maintenance"
                  }
                  description={
                    isPlan
                      ? "Saved maintenance due dates in the selected month will appear here."
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
