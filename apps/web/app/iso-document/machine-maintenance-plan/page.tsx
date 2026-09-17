import { MachineMaintenanceReport } from "@/components/maintenance/machine-maintenance-report"

export default async function MachineMaintenancePlanPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const { month } = await searchParams
  return <MachineMaintenanceReport mode="plan" month={month} />
}
