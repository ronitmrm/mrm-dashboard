import { createCommercialRevisionsRepository } from "@workspace/db"
import { StatusBadge } from "@workspace/ui/components/badge"
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
          and completed requests. Status is updated when this page is loaded.
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
                  {request.status === "Completed"
                    ? "Completed"
                    : origin === "customer" ||
                        request.status === "Pending Customer Costing"
                      ? "Customer Parameter Costing"
                      : "Product Parameter Costing"}
                </TableCell>
              </TableRow>
            ))}
            {!requests.length && (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground">
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
