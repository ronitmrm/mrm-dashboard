import { notFound } from "next/navigation"
import {
  QualityChartGrid,
  QualityReportFilters,
} from "@/components/dashboard/quality-report-charts"
import { PageHeader } from "@/components/ui/golden-patterns"
import { requireAuthenticatedSession } from "@/lib/auth/require-capability"
import { getUnifiedNavigationAccess } from "@/lib/auth/unified-navigation-access"
import {
  loadQualityReports,
  type QualityReportQuery,
} from "@/lib/quality-report-data"
import {
  qualityCharts,
  qualityReportGroups,
  type QualityReportGroup,
  type QualityChartId,
} from "@/lib/quality-reports"

export default async function QualityReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ report: string }>
  searchParams: Promise<QualityReportQuery>
}) {
  const { report } = await params
  if (!Object.hasOwn(qualityReportGroups, report)) notFound()
  const session = await requireAuthenticatedSession(`/home/quality/${report}`)
  const access = await getUnifiedNavigationAccess(session.user.id)
  const result = await loadQualityReports(access, await searchParams)
  const ids = (Object.keys(qualityCharts) as QualityChartId[]).filter(
    (id) => qualityCharts[id].group === report
  )
  return (
    <div className="grid gap-4">
      <PageHeader
        title={qualityReportGroups[report as QualityReportGroup]}
        description="Quality across all production operations"
        actions={<QualityReportFilters {...result} />}
      />
      <QualityChartGrid ids={ids} data={result.data} />
    </div>
  )
}
