import { createCustomerRepository } from "@workspace/db"
import { redirect } from "next/navigation"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import { readAuthEnvironment } from "@/lib/auth/auth"
import {
  listGrantedCapabilities,
  requireCapability,
} from "@/lib/auth/require-capability"
import { customerPageBounds } from "@/lib/customer-pagination"

import { createCustomerAction, updateCustomerAction } from "./actions"

export const dynamic = "force-dynamic"

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string | string[] }>
}) {
  const bounds = customerPageBounds((await searchParams).page)
  const session = await requireCapability(
    "pricing.masters.read",
    "/commercial/customers"
  )
  const grantedCapabilities = await listGrantedCapabilities(session.user.id, [
    "pricing.masters.write",
  ])
  const canWrite = grantedCapabilities.includes("pricing.masters.write")

  const repository = createCustomerRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const customers = await repository
    .listForOrganization("MRMPL")
    .finally(() => repository.close())
  const visibleCustomers = customers.slice(
    bounds.offset,
    bounds.offset + bounds.limit
  )
  if (!visibleCustomers.length && bounds.page > 1) {
    redirect("/commercial/customers")
  }
  const totalPages = Math.max(1, Math.ceil(customers.length / bounds.limit))

  return (
    <div className="flex flex-col gap-6">
      {canWrite ? (
        <Card>
          <CardHeader>
            <CardTitle>Add customer</CardTitle>
            <CardDescription>
              Customer IDs are allocated from the Pricing customer sequence.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={createCustomerAction}>
              <FieldGroup className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                <Field>
                  <FieldLabel htmlFor="new-company-name">
                    Company name
                  </FieldLabel>
                  <Input id="new-company-name" name="company_name" required />
                </Field>
                <Field>
                  <FieldLabel htmlFor="new-email">Email</FieldLabel>
                  <Input id="new-email" name="email" type="email" />
                </Field>
                <Field>
                  <FieldLabel htmlFor="new-phone">Phone</FieldLabel>
                  <Input id="new-phone" name="phone" />
                </Field>
                <Field>
                  <FieldLabel htmlFor="new-country">Country</FieldLabel>
                  <Input id="new-country" name="country" />
                </Field>
                <Field>
                  <FieldLabel htmlFor="new-status">Status</FieldLabel>
                  <NativeSelect
                    className="w-full"
                    id="new-status"
                    name="status"
                  >
                    <NativeSelectOption value="Active">
                      Active
                    </NativeSelectOption>
                    <NativeSelectOption value="Inactive">
                      Inactive
                    </NativeSelectOption>
                  </NativeSelect>
                </Field>
              </FieldGroup>
              <Button className="mt-6" type="submit">
                Add customer
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Customers</CardTitle>
          <CardDescription>
            Canonical customer masters with immutable Pricing source provenance.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
            <span>
              Showing {visibleCustomers.length ? bounds.offset + 1 : 0}–
              {Math.min(bounds.offset + visibleCustomers.length, customers.length)}{" "}
              of {customers.length} customers
            </span>
            <div className="flex items-center gap-2">
              {bounds.page > 1 ? (
                <Button asChild size="sm" variant="outline">
                  <a href={`/commercial/customers?page=${bounds.page - 1}`}>
                    Previous
                  </a>
                </Button>
              ) : (
                <Button disabled size="sm" variant="outline">
                  Previous
                </Button>
              )}
              <span>
                Page {Math.min(bounds.page, totalPages)} of {totalPages}
              </span>
              {bounds.page < totalPages ? (
                <Button asChild size="sm" variant="outline">
                  <a href={`/commercial/customers?page=${bounds.page + 1}`}>
                    Next
                  </a>
                </Button>
              ) : (
                <Button disabled size="sm" variant="outline">
                  Next
                </Button>
              )}
            </div>
          </div>
          <div className="overflow-x-auto rounded-3xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer ID</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Country</TableHead>
                  <TableHead>Status</TableHead>
                  {canWrite ? <TableHead>Action</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleCustomers.length ? (
                  visibleCustomers.map((customer) => {
                    const formId = `customer-${customer.id}`
                    return (
                      <TableRow key={customer.id}>
                        <TableCell className="font-medium">
                          {canWrite ? (
                            <form action={updateCustomerAction} id={formId}>
                              <input
                                name="customer_id"
                                type="hidden"
                                value={customer.id}
                              />
                            </form>
                          ) : null}
                          {customer.customerUid}
                        </TableCell>
                        <TableCell>
                          {canWrite ? (
                            <Field className="min-w-52">
                              <FieldLabel
                                className="sr-only"
                                htmlFor={`${formId}-company`}
                              >
                                Company name for {customer.customerUid}
                              </FieldLabel>
                              <Input
                                defaultValue={customer.companyName}
                                form={formId}
                                id={`${formId}-company`}
                                name="company_name"
                                required
                              />
                            </Field>
                          ) : (
                            customer.companyName
                          )}
                        </TableCell>
                        <TableCell>
                          {canWrite ? (
                            <Field className="min-w-52">
                              <FieldLabel
                                className="sr-only"
                                htmlFor={`${formId}-email`}
                              >
                                Email for {customer.customerUid}
                              </FieldLabel>
                              <Input
                                defaultValue={customer.email ?? ""}
                                form={formId}
                                id={`${formId}-email`}
                                name="email"
                                type="email"
                              />
                            </Field>
                          ) : (
                            customer.email || "—"
                          )}
                        </TableCell>
                        <TableCell>
                          {canWrite ? (
                            <Field className="min-w-44">
                              <FieldLabel
                                className="sr-only"
                                htmlFor={`${formId}-phone`}
                              >
                                Phone for {customer.customerUid}
                              </FieldLabel>
                              <Input
                                defaultValue={customer.phone ?? ""}
                                form={formId}
                                id={`${formId}-phone`}
                                name="phone"
                              />
                            </Field>
                          ) : (
                            customer.phone || "—"
                          )}
                        </TableCell>
                        <TableCell>
                          {canWrite ? (
                            <Field className="min-w-36">
                              <FieldLabel
                                className="sr-only"
                                htmlFor={`${formId}-country`}
                              >
                                Country for {customer.customerUid}
                              </FieldLabel>
                              <Input
                                defaultValue={customer.country ?? ""}
                                form={formId}
                                id={`${formId}-country`}
                                name="country"
                              />
                            </Field>
                          ) : (
                            customer.country || "—"
                          )}
                        </TableCell>
                        <TableCell>
                          {canWrite ? (
                            <Field className="min-w-32">
                              <FieldLabel
                                className="sr-only"
                                htmlFor={`${formId}-status`}
                              >
                                Status for {customer.customerUid}
                              </FieldLabel>
                              <NativeSelect
                                className="w-full"
                                defaultValue={customer.status}
                                form={formId}
                                id={`${formId}-status`}
                                name="status"
                              >
                                <NativeSelectOption value="Active">
                                  Active
                                </NativeSelectOption>
                                <NativeSelectOption value="Inactive">
                                  Inactive
                                </NativeSelectOption>
                              </NativeSelect>
                            </Field>
                          ) : (
                            <Badge variant="secondary">{customer.status}</Badge>
                          )}
                        </TableCell>
                        {canWrite ? (
                          <TableCell>
                            <Button
                              form={formId}
                              size="sm"
                              type="submit"
                              variant="outline"
                            >
                              Save
                            </Button>
                          </TableCell>
                        ) : null}
                      </TableRow>
                    )
                  })
                ) : (
                  <TableRow>
                    <TableCell
                      className="h-32 text-center text-muted-foreground"
                      colSpan={canWrite ? 7 : 6}
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
    </div>
  )
}
