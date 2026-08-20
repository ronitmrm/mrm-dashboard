import { normalizeProductionFloorCode } from "@workspace/db/production-floors"
import { redirect } from "next/navigation"

import { requireProductionPage } from "@/lib/auth/require-production-page"
import { productionModuleIsEnabled } from "@/lib/production-module"

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ floor?: string | string[] }>
}) {
  if (!productionModuleIsEnabled()) redirect("/commercial")

  const { FirstPieceInspectionPage } =
    await import("@/components/mrmpl-dashboard")
  const query = await searchParams
  await requireProductionPage(
    "quality.first_piece_page.read",
    "/dashboard/first-piece-inspection"
  )

  return (
    <FirstPieceInspectionPage
      productionFloorCode={normalizeProductionFloorCode(
        Array.isArray(query.floor) ? query.floor[0] : query.floor
      )}
    />
  )
}
