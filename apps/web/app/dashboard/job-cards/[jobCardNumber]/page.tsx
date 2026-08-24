import { normalizeProductionFloorCode } from "@workspace/db/production-floors"
import { redirect } from "next/navigation"

import { JobCardWorkspace } from "@/components/job-card-workspace"
import { requireProductionPage } from "@/lib/auth/require-production-page"
import { productionCapabilityForTab } from "@/lib/auth/production-capabilities"
import { productionModuleIsEnabled } from "@/lib/production-module"

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ jobCardNumber: string }>
  searchParams: Promise<{ floor?: string | string[] }>
}) {
  if (!productionModuleIsEnabled()) redirect("/commercial")
  const [route, query] = await Promise.all([params, searchParams])
  const floor = normalizeProductionFloorCode(
    Array.isArray(query.floor) ? query.floor[0] : query.floor
  )
  await requireProductionPage(
    productionCapabilityForTab("jobCardStatusTab", floor)!,
    "/dashboard/job-cards"
  )
  return <JobCardWorkspace floor={floor} jobCardNumber={route.jobCardNumber} />
}
