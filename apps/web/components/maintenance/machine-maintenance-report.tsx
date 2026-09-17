import { createMaintenanceRepository } from "@workspace/db"
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

async function readReportRows(isPlan: boolean, month: string) {
  const repository = createMaintenanceRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  return (async () => {
    const organizationId = await repository.organizationIdForCode("MRMPL")
    if (isPlan) {
      return (
        await repository.listMachineMaintenancePlan(organizationId, month)
      ).map((row) => ({
        ...row,
        taskType: "Planned",
        completedBy: null,
        workDone: null,
      }))
    }
    return (
      await repository.listCompletedMachineMaintenance(organizationId)
    ).map((row) => ({
      ...row,
      status: "Completed",
    }))
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
  const machines = new Set(
    rows.map((row) => `${row.productionUnit}|${row.machineNumber}`)
  ).size

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title={document.title}
        description={
          isPlan
            ? "Saved maintenance due dates for the whole month, across all production units. Completed planned work stays in its due month."
            : "Completed planned maintenance and breakdown repairs across all production units. One row per completed job."
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
          { label: "Machines", value: machines, tone: "information" },
        ]}
      />
      <OperationalTable
        filterStorageKey={`iso-machine-maintenance-${mode}`}
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
            <TableHead>Machine</TableHead>
            <TableHead>Production Unit</TableHead>
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
                  : formatIstDateTime(row.completedAt)}
              </TableCell>
              <TableCell>{row.machineNumber}</TableCell>
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
                </>
              )}
            </TableRow>
          ))}
          {!rows.length ? (
            <TableRow>
              <TableCell colSpan={isPlan ? 6 : 7}>
                <StandardState
                  title={
                    isPlan
                      ? "No maintenance planned for this month"
                      : "No completed machine maintenance"
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
