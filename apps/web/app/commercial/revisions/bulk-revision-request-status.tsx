import Link from "next/link"
import { createCommercialRevisionsRepository } from "@workspace/db"
import { StatusBadge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  SectionCard,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  OperationalTable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { readAuthEnvironment } from "@/lib/auth/auth"

const originRoutes = {
  product: ["Product Parameter Bulk Revision"],
  customer: [
    "Customer Parameter Bulk Revision",
    "Customer Parameter Costing Only",
    "Bulk Revision",
  ],
}

export async function BulkRevisionRequestStatus({
  origin,
}: {
  origin: "product" | "customer"
}) {
  const repository = createCommercialRevisionsRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const revisions = await repository
    .listBulkPriceRevisions("MRMPL")
    .finally(() => repository.close())
  const requests = revisions.filter((revision) =>
    originRoutes[origin].includes(revision.revisionRoute)
  )

  return (
    <SectionCard id="revision-request-status">
      <CardHeader>
        <CardTitle>Revision Request Status</CardTitle>
        <CardDescription>
          All requests initiated here, including requests handed over to costing
          and completed requests. Open incomplete requests in their current
          costing queue, or view completed requests as read-only revision details.
          Status is updated when this page is loaded.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <OperationalTable
          excelFilters
          filterStorageKey={`${origin}-bulk-revision-request-status`}
        >
          <TableHeader>
            <TableRow>
              <TableHead>Revision</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Effective Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Current Stage</TableHead>
              <TableHead>Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {requests.map((request) => (
              <TableRow key={request.id}>
                <TableCell>{request.revisionNumber}</TableCell>
                <TableCell>
                  {request.companyName ??
                    (origin === "product"
                      ? "All affected customers"
                      : "All customers")}
                </TableCell>
                <TableCell className="min-w-64 whitespace-normal">
                  {request.reason}
                </TableCell>
                <TableCell>{request.effectiveOn}</TableCell>
                <TableCell>
                  <StatusBadge value={request.status} />
                </TableCell>
                <TableCell>
                  {["Completed", "Cancelled"].includes(request.status)
                    ? request.status
                    : origin === "customer" ||
                        request.status === "Pending Customer Costing"
                      ? "Customer Parameter Costing"
                      : "Product Parameter Costing"}
                </TableCell>
                <TableCell>
                  {request.status === "Completed" ? (
                    <Button asChild variant="outline" size="sm">
                      <Link
                        href={`/commercial/${origin}-bulk-revision/history/${request.id}`}
                      >
                        View {request.revisionNumber}
                      </Link>
                    </Button>
                  ) : (
                    <Button asChild variant="outline" size="sm">
                      <Link
                        href={
                          origin === "customer"
                            ? `/commercial/customer-costing/customer-revisions/${request.id}`
                            : request.status === "Pending Customer Costing"
                              ? `/commercial/customer-costing/revisions/${request.id}`
                              : `/commercial/product-costing/revisions/${request.id}`
                        }
                      >
                        Open {request.revisionNumber}
                      </Link>
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {!requests.length && (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground">
                  No revision requests have been initiated here.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </OperationalTable>
      </CardContent>
    </SectionCard>
  )
}
