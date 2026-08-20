import { normalizeProductionFloorCode } from "@workspace/db/production-floors"
import { redirect } from "next/navigation"

import { JobCardWorkspace } from "@/components/job-card-workspace"
import { requireProductionPage } from "@/lib/auth/require-production-page"
import { productionModuleIsEnabled } from "@/lib/production-module"

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ jobCardNumber: string }>
  searchParams: Promise<{ floor?: string | string[] }>
}) {
  if (!productionModuleIsEnabled()) redirect("/commercial")
  await requireProductionPage("operations.job_cards.read", "/dashboard/job-cards")
  const [route, query] = await Promise.all([params, searchParams])
  return <JobCardWorkspace
    floor={normalizeProductionFloorCode(Array.isArray(query.floor) ? query.floor[0] : query.floor)}
    jobCardNumber={route.jobCardNumber}
  />
}
