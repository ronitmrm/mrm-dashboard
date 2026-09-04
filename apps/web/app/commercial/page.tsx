import {
  createCommercialReportingRepository,
  createCustomerRepository,
} from "@workspace/db"
import {
  BadgeCheck,
  BarChart3,
  Calculator,
  CircleDollarSign,
  Clock3,
  Database,
  Inbox,
  PackageCheck,
  Send,
  TableProperties,
  Users,
} from "lucide-react"

import { Badge } from "@workspace/ui/components/badge"
import { MetricCard } from "@workspace/ui/components/card"
import {
  OperationalTable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import {
  ChartCard,
  DashboardBarChart,
  DashboardGrid,
  PageHeader,
  DashboardSection,
  DataTableCard,
} from "@/components/dashboard/dashboard-components"
import { PinDashboardMetricButton } from "@/components/dashboard/pin-dashboard-metric-button"
import { readAuthEnvironment } from "@/lib/auth/auth"
import { commercialCapabilities } from "@/lib/auth/commercial-capabilities"
import { requireCapability } from "@/lib/auth/require-capability"

export default async function CommercialPage() {
  await requireCapability(commercialCapabilities.dashboard.read, "/commercial")
  const connectionString = readAuthEnvironment().connectionString
  const customers = createCustomerRepository({ connectionString })
  const repository = createCommercialReportingRepository({ connectionString })
  let dashboard
  try {
    dashboard = await repository.dashboard({
      organizationId: await customers.organizationIdForCode("MRMPL"),
    })
  } finally {
    await repository.close()
    await customers.close()
  }
  const stats = [
    {
      description: "Canonical customer masters",
      metricId: "commercial.customers",
      icon: Users,
      label: "Customers",
      tone: "neutral",
      value: dashboard.stats.customers,
    },
    {
      description: "Commercial enquiries received",
      metricId: "commercial.enquiries",
      icon: Inbox,
      label: "Enquiries",
      tone: "brand",
      value: dashboard.stats.enquiries,
    },
    {
      description: "Sent in the current month",
      metricId: "commercial.quoted-this-month",
      icon: Send,
      label: "Quoted this month",
      tone: "information",
      value: dashboard.stats.monthlyQuoted,
    },
    {
      description: "Awaiting costing completion",
      metricId: "commercial.pending-costing",
      icon: Calculator,
      label: "Pending costing",
      tone: "warning",
      value: dashboard.stats.pendingCosting,
    },
    {
      description: "Active quoted prices",
      metricId: "commercial.active-quotes",
      icon: CircleDollarSign,
      label: "Q prices",
      tone: "neutral",
      value: dashboard.stats.quoted,
    },
    {
      description: "Converted commercial lines",
      metricId: "commercial.ordered",
      icon: PackageCheck,
      label: "Ordered",
      tone: "positive",
      value: dashboard.stats.ordered,
    },
    {
      description: "Active production prices",
      metricId: "commercial.active-production-prices",
      icon: BadgeCheck,
      label: "Active P prices",
      tone: "accent",
      value: dashboard.stats.pPrices,
    },
    {
      description: "Customer actions now due",
      metricId: "commercial.followups-due",
      icon: Clock3,
      label: "Follow-ups due",
      tone: "danger",
      value: dashboard.stats.pendingFollowups,
    },
  ] as const

  return (
    <div className="grid gap-6">
      <PageHeader
        badge={
          <Badge variant="outline">
            <Database aria-hidden="true" /> Canonical Postgresql Analytics
          </Badge>
        }
        description="Source-Equivalent Counts, Six-Month Quoting, Workflow Load, Quote Mix, Material Lead Time, And Customer Pareto—All Bounded To Mrmpl."
        icon={BarChart3}
        title="Commercial Workflow Dashboard"
      />

      <DashboardSection
        description="A concise view of commercial volume, conversion, and work requiring attention."
        title="Key Performance Indicators"
      >
        <DashboardGrid>
          {stats.map((stat) => {
            const Icon = stat.icon
            return (
              <MetricCard
                action={<PinDashboardMetricButton metricId={stat.metricId} />}
                description={stat.description}
                icon={<Icon aria-hidden="true" />}
                key={stat.label}
                label={stat.label}
                tone={stat.tone}
                value={stat.value}
              />
            )
          })}
        </DashboardGrid>
      </DashboardSection>

      <DashboardSection
        description="Volume and queue comparisons using the same source definitions as before."
        title="Trends & Comparisons"
      >
        <DashboardGrid columns="two">
          <ChartCard
            description="Sent, Non-Superseded Quote Items By Source Month Bucket."
            empty={!dashboard.monthlyQuotedItems.length}
            title="Quoted Items — Six Months"
          >
            <DashboardBarChart
              rows={dashboard.monthlyQuotedItems.map((row) => ({
                label: row.month,
                value: row.count,
              }))}
            />
          </ChartCard>
          <ChartCard
            description="Open Work Using The Source Queue Definitions."
            empty={!dashboard.workflowLoad.length}
            title="Workflow Load"
          >
            <DashboardBarChart
              rows={dashboard.workflowLoad.map((row) => ({
                label: row.label,
                value: row.count,
              }))}
            />
          </ChartCard>
        </DashboardGrid>
      </DashboardSection>

      <DashboardSection
        description="Commercial composition and elapsed-time detail."
        title="Operational Detail"
      >
        <DashboardGrid columns="two">
          <ChartCard
            description="Purchase, Quoted, And In-Costing Commercial Rows."
            empty={!dashboard.quoteMix.length}
            title="Quote Mix"
          >
            <DashboardBarChart
              rows={dashboard.quoteMix.map((row) => ({
                label: row.label,
                value: row.count,
              }))}
            />
          </ChartCard>
          <DataTableCard
            description="Average Days From Enquiry Receipt To Quote Send."
            icon={TableProperties}
            title="Material Lead Time"
          >
            <div className="overflow-x-auto rounded-lg border">
              <OperationalTable>
                <TableHeader>
                  <TableRow>
                    <TableHead>Material</TableHead>
                    <TableHead className="text-right">Quoted</TableHead>
                    <TableHead className="text-right">Average Days</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dashboard.materialLeadTimes.length ? (
                    dashboard.materialLeadTimes.map((row) => (
                      <TableRow key={row.material}>
                        <TableCell>{row.material}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.quotedItems}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.averageDays.toFixed(1)}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell
                        className="h-24 text-center text-muted-foreground"
                        colSpan={3}
                      >
                        No Sent Quote Lead-Time Data Yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </OperationalTable>
            </div>
          </DataTableCard>
        </DashboardGrid>
      </DashboardSection>

      <DashboardSection
        description="The customers contributing most to sent quote volume."
        title="Supporting Analysis"
      >
        <DataTableCard
          description="Top Eight Customers By Sent Quote Items With Cumulative Share."
          icon={Users}
          title="Customer Quote Pareto"
        >
          <div className="overflow-x-auto rounded-lg border">
            <OperationalTable>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">Quoted Items</TableHead>
                  <TableHead className="text-right">Cumulative</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dashboard.customerPareto.length ? (
                  dashboard.customerPareto.map((row) => (
                    <TableRow key={row.customer}>
                      <TableCell>{row.customer}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.count}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.cumulativePercent}%
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      className="h-24 text-center text-muted-foreground"
                      colSpan={3}
                    >
                      No Sent Quote Customer Data Yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </OperationalTable>
          </div>
        </DataTableCard>
      </DashboardSection>
    </div>
  )
}
