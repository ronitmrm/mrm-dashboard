import { requireAuthenticatedSession } from "@/lib/auth/require-capability"
import { getUnifiedNavigationAccess } from "@/lib/auth/unified-navigation-access"
import { isCncDashboardCard } from "@/lib/cnc-dashboard"
import { cncDashboardCsv } from "@/lib/cnc-dashboard-export"
import { cncDashboardFilters } from "@/lib/cnc-dashboard-data"
import { loadCncDashboard } from "@/lib/cnc-department-data"
import { formatIstDateTime } from "@/lib/date-time"
import { availablePersonalDashboardWidgets } from "@/lib/personal-dashboard"

export async function GET(request: Request) {
  const session = await requireAuthenticatedSession("/home/quality")
  const access = await getUnifiedNavigationAccess(session.user.id)
  const cards = availablePersonalDashboardWidgets(access)
    .filter(({ dashboardCategory }) => dashboardCategory === "Quality")
    .map(({ id }) => id)
    .filter(isCncDashboardCard)
  if (!cards.length) return new Response(null, { status: 404 })
  const filters = cncDashboardFilters(
    Object.fromEntries(new URL(request.url).searchParams)
  )
  if (filters.from > filters.to)
    return new Response("Choose a valid date range.", { status: 400 })
  const data = await loadCncDashboard(filters, cards, true)
  const rows: (string | number | null | undefined)[][] = [
    [
      "Quality summary",
      filters.from,
      filters.to,
      filters.shift === "all" ? "All shifts" : `Shift ${filters.shift}`,
    ],
    [
      "Requests received",
      "Approvals given",
      "Pending at shift end",
      "Rejected pieces",
      "Average approval wait (min)",
    ],
    [
      data.values["cnc-qc-requests"],
      data.values["cnc-qc-completed"],
      data.values["cnc-qc-pending"],
      data.values["cnc-pieces-rejected"],
      data.values["cnc-qc-average-wait"],
    ],
  ]
  if (data.qualityWorkload) {
    rows.push(
      [],
      [
        "User",
        "Machine",
        "Job",
        "Part",
        "Requested IST",
        "Approved IST",
        "Wait (min)",
      ]
    )
    for (const {
      user,
      machine,
      job,
      part,
      requestedAt,
      at,
      waitMinutes,
    } of data.qualityWorkload.approvals) {
      rows.push([
        user,
        machine,
        job,
        part,
        requestedAt ? formatIstDateTime(requestedAt) : "",
        formatIstDateTime(at),
        waitMinutes === null ? "" : waitMinutes.toFixed(1),
      ])
    }
  }
  return cncDashboardCsv(
    rows,
    `cnc-quality-${filters.from}-${filters.to}-${filters.shift}.csv`
  )
}
