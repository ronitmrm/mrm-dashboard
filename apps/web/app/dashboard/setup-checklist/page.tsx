import { normalizeProductionFloorCode } from "@workspace/db/production-floors"
import { redirect } from "next/navigation"

import { requireCapability } from "@/lib/auth/require-capability"
import { productionModuleIsEnabled } from "@/lib/production-module"

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ floor?: string | string[] }>
}) {
  if (!productionModuleIsEnabled()) redirect("/commercial")

  const { SetupChecklistPage } = await import("@/components/mrmpl-dashboard")
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
