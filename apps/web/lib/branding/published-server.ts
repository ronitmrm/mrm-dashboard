import "server-only"
import { notFound } from "next/navigation"
import { createBrandingRepository } from "@workspace/db"
import { requireAuthenticatedSession } from "@/lib/auth/require-capability"
import { getWebPostgresPool } from "@/lib/postgres-runtime"

export async function withPublishedRegister<T>(
  type: string,
  operation: (context: {
    repository: ReturnType<typeof createBrandingRepository>
    organizationId: string
    type: "sop" | "policy" | "work-instruction" | "controlled-document"
  }) => Promise<T>
) {
  await requireAuthenticatedSession(`/registers/${type}`)
  if (type !== "sop" && type !== "policy" && type !== "work-instruction" && type !== "controlled-document")
    notFound()
  const repository = createBrandingRepository({ pool: getWebPostgresPool() })
  try {
    return await operation({
      repository,
      organizationId: await repository.organizationId(),
      type,
    })
  } finally {
    await repository.close()
  }
}
