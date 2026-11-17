import Link from "next/link"
import { notFound } from "next/navigation"
import { Download } from "lucide-react"
import { createUserDashboardRepository } from "@workspace/db"
import { Button } from "@workspace/ui/components/button"

import { CncQualityDashboard } from "@/components/dashboard/cnc-quality-dashboard"
import { CncReferenceDashboard } from "@/components/dashboard/cnc-reference-dashboard"
import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireAuthenticatedSession } from "@/lib/auth/require-capability"
import { getUnifiedNavigationAccess } from "@/lib/auth/unified-navigation-access"
import {
  cncDashboardDepartments,
  cncDashboardIncludes,
  type CncDashboardDepartment,
  isCncDashboardCard,
} from "@/lib/cnc-dashboard"
import { cncDashboardFilters } from "@/lib/cnc-dashboard-data"
import { loadCncDashboard } from "@/lib/cnc-department-data"
import {
  availablePersonalDashboardWidgets,
  resolvePersonalDashboardSelection,
} from "@/lib/personal-dashboard"

export default async function DepartmentDashboard({
  params,
  searchParams,
}: {
  params: Promise<{ department: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [{ department }, query] = await Promise.all([params, searchParams])
  if (!Object.hasOwn(cncDashboardDepartments, department)) notFound()
  const departmentId = department as CncDashboardDepartment
  const href = `/home/${department}`
  const session = await requireAuthenticatedSession(href)
  const access = await getUnifiedNavigationAccess(session.user.id)
  const available = availablePersonalDashboardWidgets(access)
  const widgets = available
    .filter(
      ({ id }) =>
        isCncDashboardCard(id) && cncDashboardIncludes(departmentId, id)
    )
    .flatMap((widget) =>
      isCncDashboardCard(widget.id) ? [{ ...widget, id: widget.id }] : []
    )
  if (!widgets.length) notFound()

  const filters = cncDashboardFilters(query)
  const repository = createUserDashboardRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  try {
    const [saved, data] = await Promise.all([
      repository.load(session.user.id),
      filters.from <= filters.to
        ? loadCncDashboard(
            filters,
            widgets.map(({ id }) => id),
            department === "quality" || department === "machinist"
          )
        : null,
    ])
    const pinned = new Set(
      resolvePersonalDashboardSelection(saved, available).map(({ id }) => id)
    )
    const exportLabel = {
      production: "Export selected production",
      quality: "Export quality summary",
      machinist: "Export setup work",
      "shop-floor": "Export shop-floor tasks",
      maintenance: "Export maintenance summary",
      planning: "Export priority log",
    }[departmentId]
    const actions = (
      <div className="flex flex-wrap items-center gap-2.5">
        <Button asChild variant="outline" className="h-[42px] rounded-lg">
          <Link href={`/home?${new URLSearchParams(filters)}`}>
            My Dashboard
          </Link>
        </Button>
        {data ? (
          <Button asChild className="h-[42px] rounded-lg px-4">
            <a href={`${href}/export.csv?${new URLSearchParams(filters)}`}>
              <Download aria-hidden="true" /> {exportLabel}
            </a>
          </Button>
        ) : null}
      </div>
    )
    const props = {
      actions,
      availableIds: new Set(widgets.map(({ id }) => id)),
      data,
      filters,
      pinnedIds: pinned,
    }
    return (
      <div className="w-full min-w-0">
        {departmentId === "quality" ? (
          <CncQualityDashboard {...props} />
        ) : (
          <CncReferenceDashboard department={departmentId} {...props} />
        )}
      </div>
    )
  } finally {
    await repository.close()
  }
}
