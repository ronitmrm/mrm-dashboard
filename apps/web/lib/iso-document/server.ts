import "server-only"

import { createBrandingRepository } from "@workspace/db"
import { getWebPostgresPool } from "@/lib/postgres-runtime"
import {
  listGrantedCapabilities,
  requireAuthenticatedSession,
  requireCapability,
} from "@/lib/auth/require-capability"
import {
  isoDocumentCapabilities,
  type IsoDocumentAction,
} from "@/lib/auth/iso-document-capabilities"
import { brandingCapability } from "@/lib/auth/branding-capabilities"
import type { BrandingType } from "@workspace/db/branding-domain"
import { notFound } from "next/navigation"

export async function withDocumentControl<T>(
  action: IsoDocumentAction | "read",
  operation: (context: {
    repository: ReturnType<typeof createBrandingRepository>
    organizationId: string
    userId: string
    userName: string
  }) => Promise<T>
) {
  const returnPath = "/iso-document/documents"
  const session =
    action === "read"
      ? await requireAuthenticatedSession(returnPath)
      : await requireCapability(isoDocumentCapabilities[action], returnPath)
  const repository = createBrandingRepository({ pool: getWebPostgresPool() })
  try {
    return await operation({
      repository,
      organizationId: await repository.organizationId(),
      userId: session.user.id,
      userName: session.user.name,
    })
  } finally {
    await repository.close()
  }
}

export async function documentControlAccess(userId: string) {
  const granted = new Set(
    await listGrantedCapabilities(
      userId,
      Object.values(isoDocumentCapabilities)
    )
  )
  return {
    canManage: granted.has(isoDocumentCapabilities.manage),
    canApprove: granted.has(isoDocumentCapabilities.approve),
    canRelease: granted.has(isoDocumentCapabilities.release),
    canMonitor: granted.has(isoDocumentCapabilities.monitor),
  }
}

export async function withDocumentContentAccess<T>(
  input: {
    documentId: string
    type: BrandingType
    draft: boolean
    returnPath: string
  },
  operation: (context: {
    repository: ReturnType<typeof createBrandingRepository>
    organizationId: string
  }) => Promise<T>
) {
  const session = await requireAuthenticatedSession(input.returnPath)
  const repository = createBrandingRepository({ pool: getWebPostgresPool() })
  try {
    const organizationId = await repository.organizationId()
    const dossier = await repository.getControlDossier(
      organizationId,
      input.documentId
    )
    if (!dossier || dossier.type !== input.type) notFound()
    const granted = new Set(
      await listGrantedCapabilities(session.user.id, [
        brandingCapability(input.type, "read"),
        ...Object.values(isoDocumentCapabilities),
      ])
    )
    let allowed =
      granted.has(brandingCapability(input.type, "read")) ||
      granted.has(isoDocumentCapabilities.manage) ||
      granted.has(isoDocumentCapabilities.release) ||
      (!input.draft && dossier.contentAccess === "all-signed-in")
    if (!allowed && granted.has(isoDocumentCapabilities.approve)) {
      const departments = await repository.approvalDepartments({
        organizationId,
        userId: session.user.id,
      })
      const revision = dossier.revisions.find((entry) =>
        input.draft ? entry.state === "draft" : entry.state === "issued"
      )
      allowed =
        departments === null ||
        Boolean(
          revision &&
          departments.some(
            (department) =>
              department.localeCompare(revision.content.department, undefined, {
                sensitivity: "accent",
              }) === 0
          )
        )
    }
    if (!allowed) notFound()
    return await operation({ repository, organizationId })
  } finally {
    await repository.close()
  }
}
