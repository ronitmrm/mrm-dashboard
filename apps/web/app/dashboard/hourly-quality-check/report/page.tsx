import { normalizeProductionFloorCode } from "@workspace/db/production-floors"
import { redirect } from "next/navigation"

import { requireProductionPage } from "@/lib/auth/require-production-page"
import { productionCapabilityForTab } from "@/lib/auth/production-capabilities"
import { productionModuleIsEnabled } from "@/lib/production-module"

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    checkId?: string | string[]
    floor?: string | string[]
  }>
}) {
  if (!productionModuleIsEnabled()) redirect("/commercial")

  const { HourlyQualityCheckReportPage } =
    await import("@/components/mrmpl-dashboard")
  const query = await searchParams
  const floor = normalizeProductionFloorCode(
    Array.isArray(query.floor) ? query.floor[0] : query.floor
  )
  const checkId = Array.isArray(query.checkId)
    ? (query.checkId[0] ?? "")
    : (query.checkId ?? "")
  await requireProductionPage(
    productionCapabilityForTab("qualityControlTasksTab", floor)!,
    "/dashboard/hourly-quality-check/report"
  )

  return (
    <HourlyQualityCheckReportPage
      checkId={checkId}
      productionFloorCode={floor}
    />
  )
}
