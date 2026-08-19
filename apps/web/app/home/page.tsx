import { createUserDashboardRepository } from "@workspace/db"

import { PersonalDashboard } from "@/components/personal-dashboard"
import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireAuthenticatedSession } from "@/lib/auth/require-capability"
import { getUnifiedNavigationAccess } from "@/lib/auth/unified-navigation-access"
import { loadPersonalDashboardMetrics } from "@/lib/personal-dashboard-data"
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
  try {
    ;[access, savedWidgetIds] = await Promise.all([
      getUnifiedNavigationAccess(session.user.id),
      repository.load(session.user.id),
    ])
  } finally {
    await repository.close()
  }
  const availableWidgets = availablePersonalDashboardWidgets(access)
  const selectedWidgets = resolvePersonalDashboardSelection(
    savedWidgetIds,
    availableWidgets
  )
  const metrics = await loadPersonalDashboardMetrics(selectedWidgets)
  const query = await searchParams

  return (
    <PersonalDashboard
      availableWidgets={availableWidgets}
      metrics={metrics}
      onSave={savePersonalDashboard}
      saved={query.saved === "1"}
      selectedWidgetIds={selectedWidgets.map(({ id }) => id)}
      userName={session.user.name}
    />
  )
}
