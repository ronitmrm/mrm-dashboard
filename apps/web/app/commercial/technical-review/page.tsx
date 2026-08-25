import Link from "next/link"

import { createCommercialWorkflowRepository } from "@workspace/db"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
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
import {
  countTechnicalReviewChecks,
  technicalReviewChecklist,
} from "@/lib/pricing/technical-review"

export const dynamic = "force-dynamic"

export default async function TechnicalReviewPage() {
  await requireCapability(
    "pricing.technical_review.read",
    "/commercial/technical-review"
  )
  const workflow = createCommercialWorkflowRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const [result, summary] = await Promise.all([
    workflow.listTechnicalReviewQueueBounded("MRMPL"),
    workflow.getTechnicalReviewQueueSummary("MRMPL"),
  ]).finally(() => workflow.close())

  return (
    <div className="grid gap-6">
      <section className="grid gap-2">
        <h2 className="text-2xl font-semibold tracking-tight">
          Technical Review
        </h2>
        <BoundedResultNotice
          actionHref="/commercial/enquiries/register/export.xlsx"
          actionLabel="Export the complete enquiry register"
          coverage={result.coverage}
          section="Technical review"
        />
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <MetricCard label="Pending Review" value={summary.pendingReview} />
        <MetricCard
          label="Need Clarification"
          value={summary.needClarification}
        />
        <MetricCard label="Open Review Tasks" value={summary.openReviewTasks} />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Technical Review Queue</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-h-[70vh] overflow-auto rounded-md border">
            <Table containerClassName="max-h-none overflow-visible" excelFilters>
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  <TableHead data-filterable="true">Enquiry</TableHead>
                  <TableHead data-filterable="true">Line</TableHead>
                  <TableHead data-filterable="true">Customer UID</TableHead>
                  <TableHead data-filterable="true">Customer</TableHead>
                  <TableHead data-filterable="true">Part</TableHead>
                  <TableHead data-filterable="true">Description</TableHead>
                  <TableHead data-filterable="true">Grade</TableHead>
                  <TableHead data-filterable="true">Quantity</TableHead>
                  <TableHead data-filterable="true">Target Price</TableHead>
                  <TableHead data-filterable="true">Drawing</TableHead>
                  <TableHead data-filterable="true">Status</TableHead>
                  <TableHead>Checks</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.rows.map((item) => (
                  <TableRow key={item.enquiryItemId}>
                    <TableCell className="font-medium">
                      {item.enquiryNumber}
                    </TableCell>
                    <TableCell>{item.lineNumber}</TableCell>
                    <TableCell>{item.customerUid}</TableCell>
                    <TableCell>{item.companyName}</TableCell>
                    <TableCell>{item.customerPartCode}</TableCell>
                    <TableCell className="max-w-96 whitespace-normal">
                      {item.description}
                    </TableCell>
                    <TableCell>{item.grade ?? "—"}</TableCell>
                    <TableCell>{item.quantity}</TableCell>
                    <TableCell>{item.targetPrice ?? "—"}</TableCell>
                    <TableCell>
                      {item.drawingFileName ?? item.drawingReference ?? "—"}
                    </TableCell>
                    <TableCell data-filter-value={item.technicalReviewStatus}>
                      <Badge variant="outline">
                        {item.technicalReviewStatus}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {countTechnicalReviewChecks(item.technicalChecklist)} /{" "}
                      {technicalReviewChecklist.length}
                    </TableCell>
                    <TableCell>
                      <Button asChild size="sm" variant="outline">
                        <Link
                          href={`/commercial/technical-review/${item.enquiryItemId}`}
                        >
                          Open Review
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!result.rows.length ? (
                  <TableRow>
                    <TableCell
                      className="py-10 text-center text-muted-foreground"
                      colSpan={13}
                    >
                      No Lines Are Waiting For Technical Review.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
