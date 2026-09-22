import { normalizeProductionFloorCode } from "@workspace/db/production-floors"
import { redirect } from "next/navigation"

import { ProductionSessionsWorkspace } from "@/components/production-sessions-workspace"
import { requireProductionPage } from "@/lib/auth/require-production-page"
import { productionCapabilityForTab } from "@/lib/auth/production-capabilities"
import { productionModuleIsEnabled } from "@/lib/production-module"

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    floor?: string | string[]
    session?: string | string[]
  }>
}) {
  if (!productionModuleIsEnabled()) redirect("/commercial")
  const query = await searchParams
  const floor = normalizeProductionFloorCode(
    Array.isArray(query.floor) ? query.floor[0] : query.floor
  )
  await requireProductionPage(
    productionCapabilityForTab("productionSessionsTab", floor)!,
    "/dashboard/production-sessions"
  )

  const initialSessionId = Array.isArray(query.session)
    ? query.session[0]
    : query.session

  return (
    <ProductionSessionsWorkspace
      initialFloor={floor}
      initialSessionId={initialSessionId}
    />
  )
}
