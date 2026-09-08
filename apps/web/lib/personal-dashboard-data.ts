import {
  createCommercialReportingRepository,
  createCustomerRepository,
  createRecruitmentRepository,
  createStoreRepository,
} from "@workspace/db"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { istDateValue } from "@/lib/date-time"
import type {
  DashboardMetricId,
  DashboardMetricValues,
} from "@/lib/dashboard-analytics"
import type {
  PersonalDashboardWidget,
  PersonalDashboardWidgetId,
} from "@/lib/personal-dashboard"

export type PersonalDashboardMetric = {
  label: string
  metricId: DashboardMetricId
  value: number
}

export type PersonalDashboardMetrics = Partial<
  Record<PersonalDashboardWidgetId, PersonalDashboardMetric[]>
>

export async function loadPersonalDashboardMetrics(
  selectedWidgets: readonly PersonalDashboardWidget[]
) {
  const summaries = new Set(selectedWidgets.map(({ summary }) => summary))
  const entries = await Promise.all([
    summaries.has("commercial") ? loadCommercialMetrics() : null,
    summaries.has("hr") ? loadHrMetrics() : null,
    summaries.has("store") ? loadStoreMetrics() : null,
  ])

  return Object.fromEntries(
    entries.filter(
      (
        entry
      ): entry is [PersonalDashboardWidgetId, PersonalDashboardMetric[]] =>
        entry !== null
    )
  ) as PersonalDashboardMetrics
}

export function dashboardMetricValues(metrics: PersonalDashboardMetrics) {
  return Object.fromEntries(
    Object.values(metrics).flatMap((group) =>
      (group ?? []).map(({ metricId, value }) => [metricId, value] as const)
    )
  ) as DashboardMetricValues
}

async function loadCommercialMetrics(): Promise<
  [PersonalDashboardWidgetId, PersonalDashboardMetric[]]
> {
  const connectionString = readAuthEnvironment().connectionString
  const customers = createCustomerRepository({ connectionString })
  const reporting = createCommercialReportingRepository({ connectionString })
  try {
    const organizationId = await customers.organizationIdForCode("MRMPL")
    const stats = await reporting.dashboardStats({ organizationId })
    return [
      "commercial-overview",
      [
        {
          label: "Pending Costing",
          metricId: "commercial.pending-costing",
          value: stats.pendingCosting,
        },
        {
          label: "Follow-Ups Due",
          metricId: "commercial.followups-due",
          value: stats.pendingFollowups,
        },
        {
          label: "Ordered",
          metricId: "commercial.ordered",
          value: stats.ordered,
        },
        {
          label: "Customers",
          metricId: "commercial.customers",
          value: stats.customers,
        },
        {
          label: "Enquiries",
          metricId: "commercial.enquiries",
          value: stats.enquiries,
        },
        {
          label: "Quoted This Month",
          metricId: "commercial.quoted-this-month",
          value: stats.monthlyQuoted,
        },
        {
          label: "Q Prices",
          metricId: "commercial.active-quotes",
          value: stats.quoted,
        },
        {
          label: "Active P Prices",
          metricId: "commercial.active-production-prices",
          value: stats.pPrices,
        },
      ],
    ]
  } finally {
    await reporting.close()
    await customers.close()
  }
}

async function loadHrMetrics(): Promise<
  [PersonalDashboardWidgetId, PersonalDashboardMetric[]]
> {
  const repository = createRecruitmentRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  try {
    const organizationId = await repository.organizationIdForCode("MRMPL")
    const counts = await repository.count(organizationId)
    return [
      "hr-job-posts",
      [
        {
          label: "Vacant Posts",
          metricId: "hr.vacant-posts",
          value: counts.vacantPosts,
        },
        {
          label: "Open Jobs",
          metricId: "hr.open-jobs",
          value: counts.openJobs,
        },
        {
          label: "Interviews",
          metricId: "hr.interviews",
          value: counts.interviews,
        },
        {
          label: "Approved Posts",
          metricId: "hr.approved-posts",
          value: counts.posts,
        },
        {
          label: "Templates",
          metricId: "hr.templates",
          value: counts.templates,
        },
        {
          label: "Candidates",
          metricId: "hr.candidates",
          value: counts.candidates,
        },
      ],
    ]
  } finally {
    await repository.close()
  }
}

async function loadStoreMetrics(): Promise<
  [PersonalDashboardWidgetId, PersonalDashboardMetric[]]
> {
  const repository = createStoreRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  try {
    const organizationId = await repository.organizationIdForCode("MRMPL")
    const metrics = await repository.overviewMetrics({
      istToday: istDateValue(),
      organizationId,
    })
    return [
      "store-overview",
      [
        {
          label: "Open Requests",
          metricId: "store.open-requests",
          value: metrics.openRequests,
        },
        {
          label: "Low Stock",
          metricId: "store.low-stock",
          value: metrics.lowStock,
        },
        {
          label: "Maintenance Due",
          metricId: "store.due-maintenance",
          value: metrics.maintenanceDue,
        },
        {
          label: "Store Locations",
          metricId: "store.locations",
          value: metrics.locations,
        },
        {
          label: "Item Types",
          metricId: "store.item-types",
          value: metrics.itemTypes,
        },
        {
          label: "Physical Assets",
          metricId: "store.physical-assets",
          value: metrics.physicalAssets,
        },
      ],
    ]
  } finally {
    await repository.close()
  }
}
