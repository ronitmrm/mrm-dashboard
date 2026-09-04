import { createUserDashboardRepository } from "@workspace/db"

import { PersonalDashboard } from "@/components/personal-dashboard"
import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireAuthenticatedSession } from "@/lib/auth/require-capability"
import { getUnifiedNavigationAccess } from "@/lib/auth/unified-navigation-access"
import {
  availableDashboardMetricIds,
  dashboardMetricCatalog,
  dashboardMetricIdsForWidgets,
  resolveDashboardAnalyticsConfiguration,
} from "@/lib/dashboard-analytics"
import {
  dashboardMetricValues,
  loadPersonalDashboardMetrics,
} from "@/lib/personal-dashboard-data"
import {
  availablePersonalDashboardWidgets,
  resolvePersonalDashboardSelection,
} from "@/lib/personal-dashboard"

import { savePersonalDashboard } from "./actions"

export const dynamic = "force-dynamic"

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>
}) {
  const session = await requireAuthenticatedSession("/home")
  const repository = createUserDashboardRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  let access
  let savedWidgetIds: string[] | null
  let savedAnalytics: unknown
  try {
    ;[access, savedWidgetIds, savedAnalytics] = await Promise.all([
      getUnifiedNavigationAccess(session.user.id),
      repository.load(session.user.id),
      repository.loadAnalytics(session.user.id),
    ])
  } finally {
    await repository.close()
  }
  const availableWidgets = availablePersonalDashboardWidgets(access)
  const selectedWidgets = resolvePersonalDashboardSelection(
    savedWidgetIds,
    availableWidgets
  )
  const availableMetricIds = availableDashboardMetricIds(
    availableWidgets.map(({ id }) => id)
  )
  const analytics = resolveDashboardAnalyticsConfiguration(
    savedAnalytics,
    availableMetricIds
  )
  const analyticsSourceWidgetIds = new Set(
    dashboardMetricIdsForWidgets(analytics.widgets).map(
      (metricId) => dashboardMetricCatalog[metricId].sourceWidgetId
    )
  )
  const dataWidgets = availableWidgets.filter(
    (widget) =>
      selectedWidgets.some(({ id }) => id === widget.id) ||
      analyticsSourceWidgetIds.has(widget.id)
  )
  const metrics = await loadPersonalDashboardMetrics(dataWidgets)
  const metricValues = dashboardMetricValues(metrics)
  const query = await searchParams

  return (
    <PersonalDashboard
      analytics={analytics}
      availableWidgets={availableWidgets}
      availableMetricIds={availableMetricIds}
      metrics={metrics}
      metricValues={metricValues}
      onSave={savePersonalDashboard}
      saved={query.saved === "1"}
      selectedWidgetIds={selectedWidgets.map(({ id }) => id)}
      userName={session.user.name}
    />
  )
}
