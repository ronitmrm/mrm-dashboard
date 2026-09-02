import { AlertTriangle, ClipboardList } from "lucide-react"

import { createMaintenanceRequestRepository } from "@workspace/db"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"

import {
  DashboardPageHeader,
  DashboardSection,
} from "@/components/dashboard/dashboard-components"
import { MaintenanceRequestForm } from "@/components/maintenance/maintenance-request-form"
import { MaintenanceRequestTable } from "@/components/maintenance/maintenance-request-table"
import { readAuthEnvironment } from "@/lib/auth/auth"
import { maintenanceCapabilities } from "@/lib/auth/maintenance-capabilities"
import {
  listGrantedCapabilities,
  requireAuthenticatedSession,
} from "@/lib/auth/require-capability"

export default async function MaintenanceRequestsPage() {
  const session = await requireAuthenticatedSession("/maintenance/requests")
  const manager =
    (
      await listGrantedCapabilities(session.user.id, [
        maintenanceCapabilities.manager,
      ])
    ).length > 0
  const repository = createMaintenanceRequestRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  let context: Awaited<ReturnType<typeof repository.requesterContext>> | null =
    null
  let contextError: string | null = null
  let rows: Awaited<ReturnType<typeof repository.listRequests>> = []
  try {
    const organizationId = await repository.organizationIdForCode("MRMPL")
    try {
      context = await repository.requesterContext({
        organizationId,
        userId: session.user.id,
      })
    } catch (error) {
      contextError =
        error instanceof Error ? error.message : "Employee link required."
    }
    if (manager) {
      rows = await repository.listRequests({
        organizationId,
        scope: { kind: "manager" },
      })
    } else if (context) {
      rows = await repository.listRequests({
        organizationId,
        scope: { department: context.department, kind: "department" },
      })
    }
  } finally {
    await repository.close()
  }

  return (
    <div className="grid gap-6">
      <DashboardPageHeader
        description="Submit one problem per request and track requests for your department."
        icon={ClipboardList}
        title="All Requests"
      />
      {context ? (
        <MaintenanceRequestForm
          department={context.department}
          requesterName={context.requesterName}
        />
      ) : (
        <Alert variant="destructive">
          <AlertTriangle aria-hidden="true" />
          <AlertTitle>Employee profile required</AlertTitle>
          <AlertDescription>{contextError}</AlertDescription>
        </Alert>
      )}
      <DashboardSection
        description={
          manager
            ? "Manager view across all departments."
            : `Requests submitted by ${context?.department ?? "your department"}.`
        }
        title="Request Register"
      >
        <MaintenanceRequestTable managerReview={manager} rows={rows} />
      </DashboardSection>
    </div>
  )
}
