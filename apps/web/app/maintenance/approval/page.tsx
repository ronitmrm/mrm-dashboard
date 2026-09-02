import { ShieldCheck } from "lucide-react"

import { createMaintenanceRequestRepository } from "@workspace/db"

import {
 PageHeader,
  DashboardSection,
} from "@/components/dashboard/dashboard-components"
import { MaintenanceRequestTable } from "@/components/maintenance/maintenance-request-table"
import { readAuthEnvironment } from "@/lib/auth/auth"
import { maintenanceCapabilities } from "@/lib/auth/maintenance-capabilities"
import { requireCapability } from "@/lib/auth/require-capability"

export default async function MaintenanceApprovalPage() {
  await requireCapability(
    maintenanceCapabilities.manager,
    "/maintenance/approval"
  )
  const repository = createMaintenanceRequestRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const rows = await (async () => {
    const organizationId = await repository.organizationIdForCode("MRMPL")
    return repository.listRequests({
      organizationId,
      scope: { kind: "manager" },
    })
  })().finally(() => repository.close())
  const pending = rows.filter((row) => row.status === "Pending Approval")

  return (
    <div className="grid gap-6">
 <PageHeader
        description="Confirm trade and priority, then approve, return, or reject each request."
        icon={ShieldCheck}
        title="Manager Approval"
      />
      <DashboardSection
        description="Requester categories are suggestions until approved here."
        title={`${pending.length} Pending`}
      >
        <MaintenanceRequestTable managerReview rows={pending} />
      </DashboardSection>
    </div>
  )
}
