import "server-only"
import {
  createBrandingRepository,
  createIsoWorkflowRepository,
  type IsoWorkflowAccess,
} from "@workspace/db"
import { getWebPostgresPool } from "@/lib/postgres-runtime"
import {
  listGrantedCapabilities,
  requireAuthenticatedSession,
} from "@/lib/auth/require-capability"
import { isoWorkflowCapabilities } from "@/lib/auth/iso-workflow-capabilities"
import { redirect } from "next/navigation"

export async function withIsoWorkflows<T>(
  operation: (context: {
    repository: ReturnType<typeof createIsoWorkflowRepository>
    access: IsoWorkflowAccess
  }) => Promise<T>
) {
  const session = await requireAuthenticatedSession(
    "/iso-document/pending-actions"
  )
  const pool = getWebPostgresPool(),
    repository = createIsoWorkflowRepository({ pool })
  const organizationId = await createBrandingRepository({
    pool,
  }).organizationId()
  const grants = new Set(
    await listGrantedCapabilities(
      session.user.id,
      Object.values(isoWorkflowCapabilities)
    )
  )
  if (!grants.size) redirect("/unauthorized")
  const departments = grants.has(isoWorkflowCapabilities.department)
    ? await repository.userDepartments(organizationId, session.user.id)
    : []
  try {
    return await operation({
      repository,
      access: {
        organizationId,
        userId: session.user.id,
        userName: session.user.name,
        canManage: grants.has(isoWorkflowCapabilities.manage),
        canVerify: grants.has(isoWorkflowCapabilities.verify),
        canAssignDepartment: grants.has(isoWorkflowCapabilities.department),
        departments,
      },
    })
  } finally {
    await repository.close()
  }
}
