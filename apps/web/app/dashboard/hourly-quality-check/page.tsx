import { normalizeProductionFloorCode } from "@workspace/db/production-floors"
import { redirect } from "next/navigation"

import { requireProductionPage } from "@/lib/auth/require-production-page"
import { productionCapabilityForTab } from "@/lib/auth/production-capabilities"
import { productionModuleIsEnabled } from "@/lib/production-module"

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ floor?: string | string[] }>
}) {
  if (!productionModuleIsEnabled()) redirect("/commercial")

  const { HourlyQualityCheckPage } =
    await import("@/components/mrmpl-dashboard")
  const query = await searchParams
  const floor = normalizeProductionFloorCode(
    Array.isArray(query.floor) ? query.floor[0] : query.floor
  )
  await requireProductionPage(
    productionCapabilityForTab("qualityControlTasksTab", floor)!,
    "/dashboard/hourly-quality-check"
  )
  return <HourlyQualityCheckPage productionFloorCode={floor} />
}
