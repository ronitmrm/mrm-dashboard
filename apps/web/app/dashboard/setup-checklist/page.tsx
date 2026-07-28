import { normalizeProductionFloorCode } from "@workspace/db/production-floors"

import { SetupChecklistPage } from "@/components/mrmpl-dashboard"
import { requireCapability } from "@/lib/auth/require-capability"

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ floor?: string | string[] }>
}) {
  const query = await searchParams
  await requireCapability(
    "operations.dashboard.read",
    "/dashboard/setup-checklist"
  )
  return (
    <SetupChecklistPage
      productionFloorCode={normalizeProductionFloorCode(
        Array.isArray(query.floor) ? query.floor[0] : query.floor
      )}
    />
  )
}
