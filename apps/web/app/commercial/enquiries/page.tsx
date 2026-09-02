import Link from "next/link"

import {
  createCommercialMasterRepository,
  createCommercialWorkflowRepository,
  createCustomerRepository,
} from "@workspace/db"
import { Badge } from "@workspace/ui/components/badge"
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
import { MetricSummary } from "@/components/ui/golden-patterns"
import { istDateValue } from "@/lib/date-time"
import { requireCapability } from "@/lib/auth/require-capability"
import { BoundedResultNotice } from "@/components/bounded-result-notice"
import { DataDownloadButton } from "@/components/data-download-button"
import {
  MasterDataCsvDownloadButton,
  MasterDataCsvImportButton,
} from "@/components/master-data-csv-import-button"
import { OperationalWorkspaceTabs } from "@/components/operational-workspace-tabs"
import { activeEnquiryCustomers } from "@/lib/pricing/enquiry-customers"
import { commercialTermOptions } from "@/lib/commercial-term-options"

import { importEnquiryRegisterAction } from "./actions"
import { EnquiryLogForm } from "./enquiry-log-form"

export const dynamic = "force-dynamic"

export default async function EnquiriesPage({
  searchParams,
}: {
  searchParams: Promise<{ operationalView?: string }>
}) {
  const session = await requireCapability(
    "pricing.enquiries.read",
    "/commercial/enquiries"
  )
  const requestedView = (await searchParams).operationalView
  const operationalView =
    requestedView === "masterTables" ? "masterTables" : "dataEntry"
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
          workflow.listEnquiriesBounded("MRMPL", 200, {
            originatingSalespersonUserId: session.user.id,
          }),
          masterRepository.snapshot(resolvedOrganizationId),
        ])
        return {
          customers: activeEnquiryCustomers(customerRows),
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
  const termOptions = commercialTermOptions(masterSnapshot.commercialTerms)

  return (
    <div className="grid gap-6">
      <OperationalWorkspaceTabs
        activeView={operationalView}
        csvDownloadAction={
          <MasterDataCsvDownloadButton href="/commercial/enquiries/register/template.csv" />
        }
        csvImportAction={
          organizationId ? (
            <MasterDataCsvImportButton
              action={importEnquiryRegisterAction}
              fields={{ organization_id: organizationId, received_on: today }}
              fileField="enquiry_register_file"
            />
          ) : undefined
        }
        dataEntryHref="/commercial/enquiries?operationalView=dataEntry"
        exportAction={
          <DataDownloadButton href="/commercial/enquiries/register/export.xlsx" />
        }
        masterTablesHref="/commercial/enquiries?operationalView=masterTables"
      />
      <section className="grid gap-2">
        <h2 className="text-2xl font-semibold tracking-tight">Enquiries</h2>
      </section>

      {operationalView === "masterTables" ? (
        <MetricSummary
          scope="Your loaded enquiry register · before table filters"
          items={[
            {
              label: "Enquiries",
              value: enquiries.length,
              tone: "information"
            },
            {
              label: "Enquiry Lines",
              value: enquiries.reduce((total, row) => total + row.itemCount, 0)
            },
            {
              label: "Due Follow-ups",
              value: enquiries.reduce(
                (total, row) => total + row.dueFollowupCount,
                0
              ),
              tone: "warning"
            }
          ]}
        />
      ) : null}

      {operationalView === "dataEntry" ? (
 <SectionCard>
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
                Load The Mrmpl Organization And Customer Masters Before Logging
                An Enquiry.
              </p>
            )}
          </CardContent>
 </SectionCard>
      ) : null}

      {operationalView === "masterTables" ? (
 <SectionCard>
          <CardHeader>
            <CardTitle>Enquiry Register</CardTitle>
            <BoundedResultNotice
              coverage={enquiryResult.coverage}
              section="Enquiries"
            />
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-3xl border">
 <OperationalTable>
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
 </OperationalTable>
            </div>
          </CardContent>
 </SectionCard>
      ) : null}
    </div>
  )
}
