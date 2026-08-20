import {
  createCommercialReportingRepository,
  createCustomerRepository,
} from "@workspace/db"
import { BarChart3, Database } from "lucide-react"

import { Badge } from "@workspace/ui/components/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  MetricCard,
} from "@workspace/ui/components/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { commercialCapabilities } from "@/lib/auth/commercial-capabilities"
import { requireCapability } from "@/lib/auth/require-capability"

function MetricBars({
  rows,
}: {
  rows: Array<{ count: number; label: string }>
}) {
  const maximum = Math.max(1, ...rows.map((row) => row.count))
  return (
    <div className="grid gap-3">
      {rows.map((row) => (
        <div className="grid gap-1" key={row.label}>
          <div className="flex justify-between gap-3 text-sm">
            <span>{row.label}</span>
            <span className="font-medium tabular-nums">{row.count}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{
                width: String(Math.max(2, (row.count / maximum) * 100)) + "%",
              }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

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
    ["Customers", dashboard.stats.customers],
    ["Enquiries", dashboard.stats.enquiries],
    ["Quoted this month", dashboard.stats.monthlyQuoted],
    ["Pending costing", dashboard.stats.pendingCosting],
    ["Q prices", dashboard.stats.quoted],
    ["Ordered", dashboard.stats.ordered],
    ["Active P prices", dashboard.stats.pPrices],
    ["Follow-ups due", dashboard.stats.pendingFollowups],
  ] as const

  return (
    <div className="grid gap-6">
      <section className="grid gap-2">
        <Badge className="w-fit" variant="outline">
          <Database /> Canonical Postgresql Analytics
        </Badge>
        <h2 className="font-heading text-2xl font-medium tracking-tight">
          Commercial Workflow Dashboard
        </h2>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Source-Equivalent Counts, Six-Month Quoting, Workflow Load, Quote Mix,
          Material Lead Time, And Customer Pareto—All Bounded To Mrmpl.
        </p>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map(([label, count]) => (
          <MetricCard key={label} label={label} value={count} />
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="size-4" /> Quoted Items — Six Months
            </CardTitle>
            <CardDescription>
              Sent, Non-Superseded Quote Items By Source Month Bucket.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MetricBars
              rows={dashboard.monthlyQuotedItems.map((row) => ({
                count: row.count,
                label: row.month,
              }))}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Workflow Load</CardTitle>
            <CardDescription>
              Open Work Using The Source Queue Definitions.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MetricBars rows={dashboard.workflowLoad} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Quote Mix</CardTitle>
            <CardDescription>
              Purchase, Quoted, And In-Costing Commercial Rows.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MetricBars rows={dashboard.quoteMix} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Material Lead Time</CardTitle>
            <CardDescription>
              Average Days From Enquiry Receipt To Quote Send.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-xl border">
              <Table>
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
              </Table>
            </div>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Customer Quote Pareto</CardTitle>
          <CardDescription>
            Top Eight Customers By Sent Quote Items With Cumulative Share.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-xl border">
            <Table>
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
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
