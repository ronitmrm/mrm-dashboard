import {
  createCommercialReportingRepository,
  createCustomerRepository,
  createRecruitmentRepository,
  createStoreRepository,
} from "@workspace/db"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { istDateValue } from "@/lib/date-time"
import type {
  PersonalDashboardWidget,
  PersonalDashboardWidgetId,
} from "@/lib/personal-dashboard"

export type PersonalDashboardMetric = {
  label: string
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
      (entry): entry is [PersonalDashboardWidgetId, PersonalDashboardMetric[]] =>
        entry !== null
    )
  ) as PersonalDashboardMetrics
}

async function loadCommercialMetrics(): Promise<
  [PersonalDashboardWidgetId, PersonalDashboardMetric[]]
> {
  const connectionString = readAuthEnvironment().connectionString
  const customers = createCustomerRepository({ connectionString })
  const reporting = createCommercialReportingRepository({ connectionString })
  try {
    const organizationId = await customers.organizationIdForCode("MRMPL")
    const dashboard = await reporting.dashboard({ organizationId })
    return [
      "commercial-overview",
      [
        { label: "Pending Costing", value: dashboard.stats.pendingCosting },
        { label: "Follow-Ups Due", value: dashboard.stats.pendingFollowups },
        { label: "Ordered", value: dashboard.stats.ordered },
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
        { label: "Vacant Posts", value: counts.vacantPosts },
        { label: "Open Jobs", value: counts.openJobs },
        { label: "Interviews", value: counts.interviews },
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
    const [items, requests, assets] = await Promise.all([
      repository.listItemTypes(organizationId),
      repository.listRequisitions({ organizationId }),
      repository.listAssets({ organizationId }),
    ])
    return [
      "store-overview",
      [
        {
          label: "Open Requests",
          value: requests.rows.filter(({ status }) =>
            ["Pending", "Partially Issued"].includes(status)
          ).length,
        },
        {
          label: "Low Stock",
          value: items.filter(
            (item) => Number(item.availableStock) <= Number(item.minimumStock)
          ).length,
        },
        {
          label: "Maintenance Due",
          value: assets.filter(
            (asset) => asset.nextDueOn && asset.nextDueOn <= istDateValue()
          ).length,
        },
      ],
    ]
  } finally {
    await repository.close()
  }
}
