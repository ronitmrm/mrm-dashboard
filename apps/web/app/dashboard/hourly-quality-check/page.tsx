import { HourlyQualityCheckPage } from "@/components/mrmpl-dashboard"
import { requireCapability } from "@/lib/auth/require-capability"

export default async function Page() {
  await requireCapability(
    "operations.dashboard.read",
    "/dashboard/hourly-quality-check"
  )
  return <HourlyQualityCheckPage />
}
