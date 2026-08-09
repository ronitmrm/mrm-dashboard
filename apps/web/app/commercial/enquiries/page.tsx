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
import { BoundedResultNotice } from "@/components/bounded-result-notice"

import { createEnquiryAction, importEnquiryRegisterAction } from "./actions"

export const dynamic = "force-dynamic"

export default async function EnquiriesPage({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string }>
}) {
  await requireCapability("pricing.enquiries.read", "/commercial/enquiries")
  const customerSearch = (await searchParams).customer?.trim() ?? ""
  const connectionString = readAuthEnvironment().connectionString
  const customerRepository = createCustomerRepository({ connectionString })
  const workflow = createCommercialWorkflowRepository({ connectionString })
  const { customerOptions, enquiryResult, organizationId } =
    await (async () => {
      try {
        return {
          customerOptions: await customerRepository.searchForOrganization(
            "MRMPL",
            customerSearch
          ),
          enquiryResult: await workflow.listEnquiriesBounded("MRMPL"),
          organizationId:
            await customerRepository.organizationIdForCode("MRMPL"),
        }
      } finally {
        await customerRepository.close()
        await workflow.close()
      }
    })()
  const enquiries = enquiryResult.rows
  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="grid gap-6">
      <section className="grid gap-2">
        <h2 className="text-2xl font-semibold tracking-tight">Enquiries</h2>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Sales intake, commercial handover, technical review, clarification,
          and design progression in one PostgreSQL workflow.
        </p>
        <div className="flex flex-wrap gap-2 pt-2">
          <Button asChild size="sm" variant="outline">
            <Link href="/commercial/enquiries/register/export.xlsx">
              Export register
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/commercial/enquiries/register/template.xlsx">
              Register template
            </Link>
          </Button>
        </div>
      </section>

      {organizationId ? (
        <Card>
          <CardHeader>
            <CardTitle>Import enquiry register</CardTitle>
            <CardDescription>
              CSV, XLS, or XLSX rows update an editable ENQ or create a new one.
              The whole file rolls back if any customer or gate is invalid.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={importEnquiryRegisterAction}>
              <input
                type="hidden"
                name="organization_id"
                value={organizationId}
              />
              <input type="hidden" name="received_on" value={today} />
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="enquiry-register-file">
                    Register file
                  </FieldLabel>
                  <Input
                    id="enquiry-register-file"
                    name="enquiry_register_file"
                    type="file"
                    accept=".csv,.xls,.xlsx"
                    required
                  />
                </Field>
                <Button type="submit">Import register</Button>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Log enquiry</CardTitle>
          <CardDescription>
            ENQ numbering follows the recovered monthly sequence. Commercial
            terms are validated again before technical handover.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          <form
            className="flex flex-col gap-2 sm:flex-row sm:items-end"
            id="customer-search"
          >
            <Field className="max-w-md flex-1">
              <FieldLabel htmlFor="customer-query">Find customer</FieldLabel>
              <Input
                defaultValue={customerSearch}
                id="customer-query"
                name="customer"
                placeholder="Customer UID or company"
              />
            </Field>
            <Button type="submit" variant="outline">
              Search
            </Button>
          </form>
          <BoundedResultNotice
            actionHref="#customer-search"
            actionLabel="Refine customer search"
            coverage={customerOptions.coverage}
            searchQuery={customerSearch}
            section="Customer options"
          />
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
                      {customerOptions.rows.map((customer) => (
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
          <BoundedResultNotice
            actionHref="/commercial/enquiries/register/export.xlsx"
            actionLabel="Export the complete register"
            coverage={enquiryResult.coverage}
            section="Enquiries"
          />
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-3xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ENQ</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Received</TableHead>
                  <TableHead>Lines</TableHead>
                  <TableHead>Quoted / ordered</TableHead>
                  <TableHead>Follow-up</TableHead>
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
                      <TableCell>{enquiry.receivedOn}</TableCell>
                      <TableCell>{enquiry.itemCount}</TableCell>
                      <TableCell>
                        {enquiry.quotedLineCount} / {enquiry.orderedLineCount}
                      </TableCell>
                      <TableCell>
                        {enquiry.nextFollowupDue ?? "—"}
                        {enquiry.dueFollowupCount > 0
                          ? ` · ${enquiry.dueFollowupCount} due`
                          : ""}
                      </TableCell>
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
                      colSpan={9}
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
