import Link from "next/link"

import {
  createCommercialWorkflowRepository,
  createCustomerRepository,
} from "@workspace/db"
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
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
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
import { Textarea } from "@workspace/ui/components/textarea"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"

import { createEnquiryAction } from "./actions"

export const dynamic = "force-dynamic"

export default async function EnquiriesPage() {
  await requireCapability("pricing.enquiries.read", "/commercial/enquiries")
  const connectionString = readAuthEnvironment().connectionString
  const customerRepository = createCustomerRepository({ connectionString })
  const workflow = createCommercialWorkflowRepository({ connectionString })
  const [customers, enquiries] = await Promise.all([
    customerRepository
      .listForOrganization("MRMPL")
      .finally(() => customerRepository.close()),
    workflow.listEnquiries("MRMPL").finally(() => workflow.close()),
  ])
  const organizationId = customers[0]?.organizationId
  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="grid gap-6">
      <section className="grid gap-2">
        <h2 className="text-2xl font-semibold tracking-tight">Enquiries</h2>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Sales intake, commercial handover, technical review, clarification,
          and design progression in one PostgreSQL workflow.
        </p>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Log enquiry</CardTitle>
          <CardDescription>
            ENQ numbering follows the recovered monthly sequence. Commercial
            terms are validated again before technical handover.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {organizationId ? (
            <form action={createEnquiryAction}>
              <input
                type="hidden"
                name="organization_id"
                value={organizationId}
              />
              <FieldGroup>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <Field>
                    <FieldLabel htmlFor="enquiry-customer">Customer</FieldLabel>
                    <NativeSelect
                      id="enquiry-customer"
                      name="customer_id"
                      required
                    >
                      {customers.map((customer) => (
                        <NativeSelectOption
                          key={customer.id}
                          value={customer.id}
                        >
                          {customer.customerUid} · {customer.companyName}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="enquiry-received">
                      Received on
                    </FieldLabel>
                    <Input
                      id="enquiry-received"
                      name="received_on"
                      type="date"
                      defaultValue={today}
                      required
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="enquiry-source">Source</FieldLabel>
                    <NativeSelect
                      id="enquiry-source"
                      name="source"
                      defaultValue="Email"
                    >
                      <NativeSelectOption value="Email">
                        Email
                      </NativeSelectOption>
                      <NativeSelectOption value="Portal">
                        Portal
                      </NativeSelectOption>
                      <NativeSelectOption value="Phone">
                        Phone
                      </NativeSelectOption>
                    </NativeSelect>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="enquiry-priority">Priority</FieldLabel>
                    <NativeSelect
                      id="enquiry-priority"
                      name="priority"
                      defaultValue="Normal"
                    >
                      <NativeSelectOption value="Normal">
                        Normal
                      </NativeSelectOption>
                      <NativeSelectOption value="High">High</NativeSelectOption>
                      <NativeSelectOption value="Urgent">
                        Urgent
                      </NativeSelectOption>
                    </NativeSelect>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="enquiry-buyer">Buyer</FieldLabel>
                    <Input id="enquiry-buyer" name="buyer_name" />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="enquiry-incoterms">
                      Incoterms
                    </FieldLabel>
                    <Input id="enquiry-incoterms" name="incoterms" />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="enquiry-payment">
                      Payment terms
                    </FieldLabel>
                    <Input id="enquiry-payment" name="payment_terms" />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="enquiry-shipment">
                      Shipment mode
                    </FieldLabel>
                    <Input id="enquiry-shipment" name="shipment_mode" />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="enquiry-packaging">
                      Packaging
                    </FieldLabel>
                    <Input id="enquiry-packaging" name="packaging_terms" />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="enquiry-currency">Currency</FieldLabel>
                    <Input
                      id="enquiry-currency"
                      name="currency"
                      defaultValue="USD"
                      required
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="enquiry-fx">
                      FX / exchange rate
                    </FieldLabel>
                    <Input
                      id="enquiry-fx"
                      name="conversion_rate"
                      type="number"
                      min="0.00000001"
                      step="0.00000001"
                      defaultValue="1"
                      required
                    />
                  </Field>
                </div>
                <Field>
                  <FieldLabel htmlFor="enquiry-remarks">Remarks</FieldLabel>
                  <Textarea id="enquiry-remarks" name="remarks" />
                  <FieldDescription>
                    Technical line details are added after the enquiry is
                    logged.
                  </FieldDescription>
                </Field>
                <Button type="submit">Log enquiry</Button>
              </FieldGroup>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">
              Load the MRMPL organization and customer masters before logging an
              enquiry.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Enquiry register</CardTitle>
          <CardDescription>
            Current handover state and line count from normalized PostgreSQL
            rows.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-3xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ENQ</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Lines</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Handover</TableHead>
                  <TableHead className="text-right">Open</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {enquiries.length ? (
                  enquiries.map((enquiry) => (
                    <TableRow key={enquiry.id}>
                      <TableCell className="font-medium">
                        {enquiry.enquiryNumber}
                      </TableCell>
                      <TableCell>{enquiry.companyName}</TableCell>
                      <TableCell>{enquiry.itemCount}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{enquiry.status}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {enquiry.technicalHandoverStatus}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/commercial/enquiries/${enquiry.id}`}>
                            View
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      className="h-32 text-center text-muted-foreground"
                      colSpan={6}
                    >
                      No enquiries have been logged.
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
