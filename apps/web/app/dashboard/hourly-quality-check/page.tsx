import { normalizeProductionFloorCode } from "@workspace/db/production-floors"

import { HourlyQualityCheckPage } from "@/components/mrmpl-dashboard"
import { requireCapability } from "@/lib/auth/require-capability"

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ floor?: string | string[] }>
}) {
  const query = await searchParams
  await requireCapability(
    "operations.dashboard.read",
    "/dashboard/hourly-quality-check"
  )
  return (
    <HourlyQualityCheckPage
      productionFloorCode={normalizeProductionFloorCode(
        Array.isArray(query.floor) ? query.floor[0] : query.floor
      )}
    />
  )
}
