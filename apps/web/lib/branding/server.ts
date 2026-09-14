import "server-only"
import { createBrandingRepository } from "@workspace/db"
import { getWebPostgresPool } from "@/lib/postgres-runtime"
import { requireCapability } from "@/lib/auth/require-capability"
import { brandingCapability } from "@/lib/auth/branding-capabilities"
import {
  isBrandingType,
  type BrandingType,
} from "@workspace/db/branding-domain"
import { notFound } from "next/navigation"

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
  }) => Promise<T>
) {
  const session = await requireCapability(
    brandingCapability(type, "read"),
    `/branding/${type}`
  )
  if (action === "write")
    await requireCapability(
      brandingCapability(type, "write"),
      `/branding/${type}`
    )
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
