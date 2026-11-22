import { requireAuthenticatedSession } from "@/lib/auth/require-capability"
import { getUnifiedNavigationAccess } from "@/lib/auth/unified-navigation-access"
import {
  cncDashboardCards,
  cncDashboardDepartments,
  cncCardInScope,
  cncDashboardIncludes,
  isCncDashboardCard,
  type CncDashboardDepartment,
} from "@/lib/cnc-dashboard"
import { cncDashboardFilters } from "@/lib/cnc-dashboard-data"
import { cncDashboardCsv } from "@/lib/cnc-dashboard-export"
import { loadCncDashboard } from "@/lib/cnc-department-data"
import { shiftLabel, unitLabel } from "@/lib/dashboard-units"
import {
  availablePersonalDashboardWidgets,
  dashboardFloorScope,
  dashboardUnits,
} from "@/lib/personal-dashboard"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ department: string }> }
) {
  const { department } = await params
  if (!Object.hasOwn(cncDashboardDepartments, department))
    return new Response(null, { status: 404 })
  const departmentId = department as CncDashboardDepartment
  const session = await requireAuthenticatedSession(`/home/${department}`)
  const access = await getUnifiedNavigationAccess(session.user.id)
  const query = new URL(request.url).searchParams
  const requested = query.get("card")
  const filters = cncDashboardFilters(
    Object.fromEntries(query),
    dashboardUnits(access)
  )
  const scope = dashboardFloorScope(access, filters.unit)
  const cards = availablePersonalDashboardWidgets(access)
    .map(({ id }) => id)
    .filter(isCncDashboardCard)
    .filter(
      (id) =>
        cncDashboardIncludes(departmentId, id) &&
        cncCardInScope(scope, id) &&
        (!requested || id === requested)
    )
  if (!cards.length) return new Response(null, { status: 404 })
  if (filters.from > filters.to)
    return new Response("Choose a valid date range.", { status: 400 })
  const data = await loadCncDashboard(filters, cards, scope)
  const rows: (string | number | null)[][] = [
    [
      `${cncDashboardDepartments[departmentId]} summary`,
      filters.from,
      filters.to,
      unitLabel(filters.unit),
      filters.shift === "all" ? "All shifts" : shiftLabel(filters.shift),
    ],
  ]
  if (!requested && Object.keys(data.values).length) {
    rows.push([], ["Indicator", "Recorded value"])
    for (const id of cards) {
      if (Object.hasOwn(data.values, id))
        rows.push([cncDashboardCards[id][0], data.values[id] ?? null])
    }
  }
  for (const id of cards) {
    const table = data.tables?.[id]
    const chart = data.charts[id]
    if (table)
      rows.push([], [cncDashboardCards[id][0]], table.columns, ...table.rows)
    else if (chart)
      rows.push(
        [],
        [cncDashboardCards[id][0]],
        ["Group", "Recorded value"],
        ...chart.map(({ label, value }) => [label, value])
      )
  }
  if (cards.includes("cnc-machine-output")) {
    rows.push(
      [],
      ["Machine production breakdown"],
      ["Machine", "Jobs", "Output", "Rejected", "Downtime (min)"],
      ...data.machines.map((row) => [
        row.machine,
        row.jobs.join(", "),
        row.produced,
        row.rejected,
        row.downtime,
      ])
    )
  }
  return cncDashboardCsv(
    rows,
    `${filters.unit}-${requested ?? department}-${filters.from}-${filters.to}-${filters.shift}.csv`
  )
}
