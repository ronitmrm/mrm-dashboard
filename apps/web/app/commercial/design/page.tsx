import Link from "next/link"

import { createCommercialWorkflowRepository } from "@workspace/db"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
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

import { BoundedResultNotice } from "@/components/bounded-result-notice"
import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"

import { startDesignWorkAction } from "../enquiries/actions"

export const dynamic = "force-dynamic"

function display(value: number | string | null | undefined) {
  return value === null || value === undefined || value === "" ? "—" : value
}

export default async function DesignPage() {
  await requireCapability("pricing.design.read", "/commercial/design")
  const workflow = createCommercialWorkflowRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const { designResult, summary } = await (async () => {
    try {
      const [designResult, summary] = await Promise.all([
        workflow.listDesignQueueBounded("MRMPL"),
        workflow.getDesignQueueSummary("MRMPL"),
      ])
      return { designResult, summary }
    } finally {
      await workflow.close()
    }
  })()

  return (
    <div className="grid gap-6">
      <section className="grid gap-2">
        <h2 className="text-2xl font-semibold tracking-tight">Design Tasks</h2>
        <p className="max-w-4xl text-sm text-muted-foreground">
          Technically approved enquiry lines arrive here as an Excel-style work
          queue. Start a line only when the Design team accepts it.
        </p>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <MetricCard label="Pending Design" value={summary.pendingDesign} />
        <MetricCard label="In Progress" value={summary.inProgress} />
        <MetricCard label="Open Design Tasks" value={summary.openTasks} />
      </section>

      <BoundedResultNotice
        actionHref="/commercial/enquiries/excel-view"
        actionLabel="Review the enquiry Excel view"
        coverage={designResult.coverage}
        section="Active Design queue"
      />

      <Card>
        <CardHeader>
          <CardTitle>Approved Line Items</CardTitle>
          <CardDescription>
            Start Work changes a pending line to In Progress and opens its
            dedicated workspace. Completed lines leave this active queue.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <Table
              excelFilters
              filterStorageKey="mrmpl:commercial:design-queue:filters:v2"
            >
              <TableHeader>
                <TableRow>
                  <TableHead>ENQ</TableHead>
                  <TableHead>Line</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Part</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Technical</TableHead>
                  <TableHead>Design</TableHead>
                  <TableHead>Portfolio</TableHead>
                  <TableHead>Designer</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {designResult.rows.length ? (
                  designResult.rows.map((item) => (
                    <TableRow key={item.enquiryItemId}>
                      <TableCell className="font-medium">
                        {item.enquiryNumber}
                      </TableCell>
                      <TableCell>{item.lineNumber}</TableCell>
                      <TableCell>
                        {item.customerUid} · {item.companyName}
                      </TableCell>
                      <TableCell>{display(item.customerPartCode)}</TableCell>
                      <TableCell>{item.description}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {item.technicalReviewStatus}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{item.designStatus}</Badge>
                      </TableCell>
                      <TableCell>{item.portfolioMatchStatus}</TableCell>
                      <TableCell>{display(item.designerName)}</TableCell>
                      <TableCell className="text-right">
                        {item.designStatus === "Pending Design" ? (
                          <form action={startDesignWorkAction}>
                            <input
                              name="enquiry_item_id"
                              type="hidden"
                              value={item.enquiryItemId}
                            />
                            <Button size="sm" type="submit">
                              Start Work
                            </Button>
                          </form>
                        ) : (
                          <Button asChild size="sm" variant="outline">
                            <Link
                              href={`/commercial/design/${item.enquiryItemId}`}
                            >
                              Open Workspace
                            </Link>
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      className="py-10 text-center text-muted-foreground"
                      colSpan={10}
                    >
                      No active Design tasks.
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
