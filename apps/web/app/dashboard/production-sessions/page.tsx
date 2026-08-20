import { normalizeProductionFloorCode } from "@workspace/db/production-floors"
import { redirect } from "next/navigation"

import { ProductionSessionsWorkspace } from "@/components/production-sessions-workspace"
import { requireProductionPage } from "@/lib/auth/require-production-page"
import { productionModuleIsEnabled } from "@/lib/production-module"

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ floor?: string | string[] }>
}) {
  if (!productionModuleIsEnabled()) redirect("/commercial")
  const query = await searchParams
  await requireProductionPage(
    "operations.production_sessions.read",
    "/dashboard/production-sessions"
  )

  return (
    <ProductionSessionsWorkspace
      initialFloor={normalizeProductionFloorCode(
        Array.isArray(query.floor) ? query.floor[0] : query.floor
      )}
    />
  )
}
