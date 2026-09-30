import { MachineMaintenanceReport } from "@/components/maintenance/machine-maintenance-report"

export default async function MachineMaintenancePlanPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; month?: string }>
}) {
  const { from, to, month } = await searchParams
  return <MachineMaintenanceReport mode="plan" from={from} to={to} month={month} />
}
