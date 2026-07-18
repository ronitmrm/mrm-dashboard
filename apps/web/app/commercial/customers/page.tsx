import { createCustomerRepository } from "@workspace/db"
import { Badge } from "@workspace/ui/components/badge"
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

import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"

export const dynamic = "force-dynamic"

export default async function CustomersPage() {
  await requireCapability("pricing.masters.read", "/commercial/customers")

  const repository = createCustomerRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const customers = await repository
    .listForOrganization("MRMPL")
    .finally(() => repository.close())

  return (
    <Card>
      <CardHeader>
        <CardTitle>Customers</CardTitle>
        <CardDescription>
          Canonical customer masters with immutable Pricing source provenance.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-hidden rounded-3xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer ID</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Country</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Source</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.length ? (
                customers.map((customer) => (
                  <TableRow key={customer.id}>
                    <TableCell className="font-medium">
                      {customer.customerUid}
                    </TableCell>
                    <TableCell>{customer.companyName}</TableCell>
                    <TableCell>{customer.country || "—"}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{customer.status}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {customer.sourceTable}:{customer.sourceId}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    className="h-32 text-center text-muted-foreground"
                    colSpan={5}
                  >
                    No customers have been loaded into PostgreSQL yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
