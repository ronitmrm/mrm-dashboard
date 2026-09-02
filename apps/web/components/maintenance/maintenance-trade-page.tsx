import { Wrench } from "lucide-react"

import { createMaintenanceRequestRepository } from "@workspace/db"
import type { MaintenanceCategory } from "@workspace/db/maintenance-request-domain"

import {
 PageHeader,
  DashboardSection,
} from "@/components/dashboard/dashboard-components"
import { MaintenanceRequestTable } from "@/components/maintenance/maintenance-request-table"
import { readAuthEnvironment } from "@/lib/auth/auth"
import { maintenanceCapabilities } from "@/lib/auth/maintenance-capabilities"
import { requireCapability } from "@/lib/auth/require-capability"

export async function MaintenanceTradePage({
  trade,
}: {
  trade: Exclude<MaintenanceCategory, "Mechanical">
}) {
  const returnPath = `/maintenance/${trade.toLowerCase()}`
  await requireCapability(maintenanceCapabilities.trades[trade], returnPath)
  const repository = createMaintenanceRequestRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const rows = await (async () => {
    const organizationId = await repository.organizationIdForCode("MRMPL")
    return repository.listRequests({
      organizationId,
      scope: { kind: "trade", trade },
    })
  })().finally(() => repository.close())

  return (
    <div className="grid gap-6">
 <PageHeader
        description={`Approved ${trade} work. Urgent requests are listed first.`}
        icon={Wrench}
        title={trade}
      />
      <DashboardSection title={`${rows.length} Tasks`}>
        <MaintenanceRequestTable rows={rows} trade={trade} />
      </DashboardSection>
    </div>
  )
}
