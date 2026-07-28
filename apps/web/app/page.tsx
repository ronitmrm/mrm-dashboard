import {
  defaultProductionFloorCode,
  normalizeProductionFloorCode,
} from "@workspace/db/production-floors"

import { MrmplDashboard } from "@/components/mrmpl-dashboard"
import { requireCapability } from "@/lib/auth/require-capability"
import { getUnifiedNavigationAccess } from "@/lib/auth/unified-navigation-access"
import {
  dashboardNavigation,
  type DashboardTabId,
} from "@/lib/unified-navigation"

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    floor?: string | string[]
    tab?: string | string[]
  }>
}) {
  const query = await searchParams
  const session = await requireCapability("operations.dashboard.read", "/")
  const navigationAccess = await getUnifiedNavigationAccess(session.user.id)
  const requestedTab = Array.isArray(query.tab) ? query.tab[0] : query.tab
  const initialDashboardTab = dashboardNavigation.some(
    (item) => item.id === requestedTab
  )
    ? (requestedTab as DashboardTabId)
    : "productionControlTab"
  const requestedFloor = Array.isArray(query.floor)
    ? query.floor[0]
    : query.floor

  return (
    <MrmplDashboard
      initialDashboardTab={initialDashboardTab}
      initialProductionFloor={normalizeProductionFloorCode(
        requestedFloor ?? defaultProductionFloorCode
      )}
      navigationAccess={navigationAccess}
      user={{ email: session.user.email, name: session.user.name }}
    />
  )
}
