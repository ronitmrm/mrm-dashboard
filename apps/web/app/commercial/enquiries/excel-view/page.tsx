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
import { formatIstDateTime } from "@/lib/date-time"
import { enquiryExcelViewColumns } from "@/lib/pricing/enquiry-excel-view"

export const dynamic = "force-dynamic"

const numberFormat = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 4,
})

export default async function EnquiryExcelViewPage() {
  await requireCapability(
    "pricing.enquiries.read",
    "/commercial/enquiries/excel-view"
  )
  const workflow = createCommercialWorkflowRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const result = await workflow
    .listEnquirySpreadsheetBounded("MRMPL")
    .finally(() => workflow.close())

  return (
    <div className="grid gap-6">
      <section className="grid gap-2">
        <h2 className="text-2xl font-semibold tracking-tight">
          Enquiry Excel View
        </h2>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Follow Every Enquiry Line From Sales Intake Through Technical Review,
          Design, Costing, Quote Delivery, And Order Receipt.
        </p>
        <div className="flex flex-wrap gap-2 pt-2">
          <Button asChild size="sm" variant="outline">
            <Link href="/commercial/enquiries">Back To Enquiries</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/commercial/enquiries/register/export.xlsx">
              Export Complete Register
            </Link>
          </Button>
        </div>
        <BoundedResultNotice
          actionHref="/commercial/enquiries/register/export.xlsx"
          actionLabel="Export the complete enquiry register"
          coverage={result.coverage}
          section="Enquiry Excel view"
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Workflow Line Register</CardTitle>
          <CardDescription>
            Filter Any Column Like A Workbook. Your Selections Are Restored In
            This Browser.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-h-[72vh] overflow-auto rounded-md border">
            <Table
              excelFilters
              filterStorageKey="mrmpl:commercial:enquiry-excel-view:filters:v1"
              className="min-w-[2300px]"
            >
              <TableHeader className="sticky top-0 z-20 bg-background">
                <TableRow>
                  <TableHead className="sticky left-0 z-30 bg-background">
                    Quote PDF
                  </TableHead>
                  {enquiryExcelViewColumns.map(([, label, source]) => (
                    <TableHead
                      data-filter-label={label}
                      data-filterable="true"
                      key={label}
                    >
                      <span className="block">{label}</span>
                      <span className="block text-xs font-normal text-muted-foreground">
                        {source}
                      </span>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.rows.map((row) => (
                  <TableRow key={row.enquiryItemId}>
                    <TableCell className="sticky left-0 z-10 bg-background">
                      {row.quotePdfSentAt ? (
                        <Button asChild size="sm" variant="outline">
                          <Link
                            href={`/commercial/quotes/enquiry/${row.enquiryId}/pdf`}
                            target="_blank"
                          >
                            Open PDF
                          </Link>
                        </Button>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="font-mono font-medium">
                      {row.enquiryNumber}
                    </TableCell>
                    <TableCell>{row.lineNumber}</TableCell>
                    <TableCell className="font-mono">
                      {row.customerUid}
                    </TableCell>
                    <TableCell>{row.companyName}</TableCell>
                    <TableCell>{row.customerPartCode ?? "—"}</TableCell>
                    <TableCell className="max-w-96 whitespace-normal">
                      {row.description}
                    </TableCell>
                    <TableCell>{row.grade ?? "—"}</TableCell>
                    <TableCell data-filter-value={String(row.quantity)}>
                      {numberFormat.format(row.quantity)}
                    </TableCell>
                    <TableCell
                      data-filter-value={
                        row.targetPrice === null ? "" : String(row.targetPrice)
                      }
                    >
                      {row.targetPrice === null
                        ? "—"
                        : numberFormat.format(row.targetPrice)}
                    </TableCell>
                    <TableCell>{row.source}</TableCell>
                    <TableCell>{row.priority}</TableCell>
                    <TableCell>{row.buyerName ?? "—"}</TableCell>
                    <TableCell>{row.drawingReference ?? "—"}</TableCell>
                    <TableCell>
                      {row.drawingFileName ? (
                        <Link
                          className="font-medium text-primary underline-offset-4 hover:underline"
                          href={`/commercial/enquiry-items/${row.enquiryItemId}/drawing`}
                          target="_blank"
                        >
                          {row.drawingFileName}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell data-filter-value={row.currentStatus}>
                      <Badge variant="outline">{row.currentStatus}</Badge>
                    </TableCell>
                    <TableCell className="font-mono">
                      {row.designPartNumber ?? "—"}
                    </TableCell>
                    <TableCell data-filter-value={row.quotePdfStatus}>
                      <Badge variant="outline">{row.quotePdfStatus}</Badge>
                    </TableCell>
                    <TableCell
                      data-filter-value={
                        row.quotePdfSentAt
                          ? formatIstDateTime(row.quotePdfSentAt)
                          : ""
                      }
                    >
                      {row.quotePdfSentAt
                        ? formatIstDateTime(row.quotePdfSentAt)
                        : "—"}
                    </TableCell>
                    <TableCell>{row.receivedOn}</TableCell>
                  </TableRow>
                ))}
                {!result.rows.length ? (
                  <TableRow>
                    <TableCell
                      className="py-10 text-center text-muted-foreground"
                      colSpan={20}
                    >
                      No Enquiry Lines Are Available.
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
