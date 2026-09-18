import "server-only"
import { createRejectionRepository } from "@workspace/db"
import { getWebPostgresPool } from "@/lib/postgres-runtime"
import { requireCapability } from "@/lib/auth/require-capability"
import { productionFloors } from "@workspace/db/production-floors"

export async function withRejections<T>(
  action: "read" | "write" | "register",
  operation: (context: {
    repository: ReturnType<typeof createRejectionRepository>
    organizationId: string
    userId: string
  }) => Promise<T>
) {
  const path =
    action === "register" ? "/iso-document/rejections" : "/quality-control"
  const session = await requireCapability(
    action === "register"
      ? "quality.rejection_register.read"
      : "quality.control.read",
    path
  )
  if (action === "write") await requireCapability("quality.control.write", path)
  const repository = createRejectionRepository({ pool: getWebPostgresPool() })
  try {
    return await operation({
      repository,
      organizationId: await repository.organizationId(),
      userId: session.user.id,
    })
  } finally {
    await repository.close()
  }
}

export function rejectionUnit(value?: string) {
  return productionFloors.find((floor) => floor.code === value)?.code ?? ""
}
export function rejectionDate(value: string | undefined, fallback: string) {
  return value &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
    ? value
    : fallback
}
