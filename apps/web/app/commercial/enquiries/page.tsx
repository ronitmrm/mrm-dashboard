import Link from "next/link"

import {
  commercialTermTypes,
  createCommercialMasterRepository,
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
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { istDateValue } from "@/lib/date-time"
import { requireCapability } from "@/lib/auth/require-capability"
import { BoundedResultNotice } from "@/components/bounded-result-notice"

import { importEnquiryRegisterAction } from "./actions"
import { EnquiryLogForm, type CommercialTermOptions } from "./enquiry-log-form"

export const dynamic = "force-dynamic"

export default async function EnquiriesPage() {
  await requireCapability("pricing.enquiries.read", "/commercial/enquiries")
  const connectionString = readAuthEnvironment().connectionString
  const customerRepository = createCustomerRepository({ connectionString })
  const masterRepository = createCommercialMasterRepository({
    connectionString,
  })
  const workflow = createCommercialWorkflowRepository({ connectionString })
  const { customers, enquiryResult, masterSnapshot, organizationId } =
    await (async () => {
      try {
        const resolvedOrganizationId =
          await customerRepository.organizationIdForCode("MRMPL")
        const [customerRows, enquiries, masters] = await Promise.all([
          customerRepository.listForOrganization("MRMPL"),
          workflow.listEnquiriesBounded("MRMPL"),
          masterRepository.snapshot(resolvedOrganizationId),
        ])
        return {
          customers: customerRows.filter(({ status }) => status === "Active"),
          enquiryResult: enquiries,
          masterSnapshot: masters,
          organizationId: resolvedOrganizationId,
        }
      } finally {
        await customerRepository.close()
        await masterRepository.close()
        await workflow.close()
      }
    })()
  const enquiries = enquiryResult.rows
  const today = istDateValue()
  const termOptions = Object.fromEntries(
    commercialTermTypes.map((termType) => [
      termType,
      masterSnapshot.commercialTerms
        .filter((term) => term.active && term.termType === termType)
        .map((term) => term.name),
    ])
  ) as CommercialTermOptions

  return (
    <div className="grid gap-6">
      <section className="grid gap-2">
        <h2 className="text-2xl font-semibold tracking-tight">Enquiries</h2>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Sales Intake, Commercial Handover, Technical Review, Clarification,
          And Design Progression In One Postgresql Workflow.
        </p>
        <div className="flex flex-wrap gap-2 pt-2">
          <Button asChild size="sm" variant="outline">
            <Link href="/commercial/enquiries/register/export.xlsx">
              Export Register
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/commercial/enquiries/register/template.xlsx">
              Register Template
            </Link>
          </Button>
        </div>
      </section>

      {organizationId ? (
        <Card>
          <CardHeader>
            <CardTitle>Import Enquiry Register</CardTitle>
            <CardDescription>
              Csv, Xls, Or Xlsx Rows Update An Editable Enq Or Create A New One.
              The Whole File Rolls Back If Any Customer Or Gate Is Invalid.
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
                    Register File
                  </FieldLabel>
                  <Input
                    id="enquiry-register-file"
                    name="enquiry_register_file"
                    type="file"
                    accept=".csv,.xls,.xlsx"
                    required
                  />
                </Field>
                <Button type="submit">Import Register</Button>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Log Enquiry</CardTitle>
          <CardDescription>
            Enq Numbering Follows The Recovered Monthly Sequence. Commercial
            Terms Are Validated Again Before Technical Handover.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          {organizationId ? (
            <EnquiryLogForm
              customers={customers}
              organizationId={organizationId}
              termOptions={termOptions}
              today={today}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              Load The Mrmpl Organization And Customer Masters Before Logging An
              Enquiry.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Enquiry Register</CardTitle>
          <CardDescription>
            Current Handover State And Line Count From Normalized Postgresql
            Rows.
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
                  <TableHead>Enq</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Received</TableHead>
                  <TableHead>Lines</TableHead>
                  <TableHead>Quoted / Ordered</TableHead>
                  <TableHead>Follow-Up</TableHead>
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
                      No Enquiries Have Been Logged.
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
