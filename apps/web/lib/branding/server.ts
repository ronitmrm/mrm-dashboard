import "server-only"
import { createBrandingRepository } from "@workspace/db"
import { getWebPostgresPool } from "@/lib/postgres-runtime"
import {
  listGrantedCapabilities,
  requireAuthenticatedSession,
  requireCapability,
} from "@/lib/auth/require-capability"
import { documentControlCapabilities } from "../auth/document-control-capabilities"
import { brandingCapability } from "../auth/branding-capabilities"
import {
  isBrandingType,
  type BrandingType,
} from "@workspace/db/branding-domain"
import { notFound, redirect } from "next/navigation"

export function brandingType(value: string): BrandingType {
  if (!isBrandingType(value)) notFound()
  return value
}
export async function withBranding<T>(
  type: BrandingType,
  action: "read" | "write",
  operation: (context: {
    repository: ReturnType<typeof createBrandingRepository>
    organizationId: string
    userId: string
    userName: string
    permittedDepartments: string[] | null
  }) => Promise<T>
) {
  const session = await requireAuthenticatedSession(`/branding/${type}`)
  const granted = new Set(
    await listGrantedCapabilities(session.user.id, [
      brandingCapability(type, "read"),
      ...Object.values(documentControlCapabilities),
    ])
  )
  const broadRead =
    granted.has(brandingCapability(type, "read")) ||
    granted.has(documentControlCapabilities.manage) ||
    granted.has(documentControlCapabilities.release)
  if (!broadRead && !granted.has(documentControlCapabilities.approve))
    redirect("/unauthorized")
  if (action === "write") {
    await requireCapability(
      brandingCapability(type, "read"),
      `/branding/${type}`
    )
    await requireCapability(
      brandingCapability(type, "write"),
      `/branding/${type}`
    )
  }
  const repository = createBrandingRepository({ pool: getWebPostgresPool() })
  try {
    const organizationId = await repository.organizationId()
    const permittedDepartments = broadRead
      ? null
      : await repository.approvalDepartments({
          organizationId,
          userId: session.user.id,
        })
    return await operation({
      repository,
      organizationId,
      permittedDepartments,
      userId: session.user.id,
      userName: session.user.name,
    })
  } finally {
    await repository.close()
  }
}
