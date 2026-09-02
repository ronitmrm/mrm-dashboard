import {
  createCommercialMasterRepository,
  createCustomerRepository,
} from "@workspace/db"
import { redirect } from "next/navigation"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
 SectionCard,
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
 OperationalTable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { MetricSummary } from "@/components/ui/golden-patterns"
import { commercialTaskCapabilities } from "@/lib/auth/task-capabilities"
import { CompanyWideMasterScope } from "@/components/company-wide-master-scope"
import { DataDownloadButton } from "@/components/data-download-button"
import { MasterDataViewTabs } from "@/components/master-data-view-tabs"
import {
  MasterDataCsvDownloadButton,
  MasterDataCsvImportButton,
} from "@/components/master-data-csv-import-button"
import {
  listGrantedCapabilities,
  requireCapability,
} from "@/lib/auth/require-capability"
import {
  externalMasterAllMastersHref,
  externalMasterView,
  externalMasterViewHref,
} from "@/lib/external-master-workspace"
import { pageBounds } from "@/lib/page-bounds"
import { commercialTermOptions } from "@/lib/commercial-term-options"

import {
  createCustomerAction,
  importCustomersCsvAction,
  updateCustomerAction,
} from "./actions"

export const dynamic = "force-dynamic"

const customersPath = "/commercial/customers"

function CustomerDefaultSelect({
  customerUid,
  defaultValue,
  formId,
  label,
  name,
  options,
}: {
  customerUid?: string
  defaultValue?: string | null
  formId?: string
  label: string
  name: string
  options: string[]
}) {
  const id = formId ? `${formId}-${name.replaceAll("_", "-")}` : `new-${name}`
  const visibleOptions =
    defaultValue && !options.includes(defaultValue)
      ? [defaultValue, ...options]
      : options
  return (
    <Field className={formId ? "min-w-40" : undefined}>
      <FieldLabel className={formId ? "sr-only" : undefined} htmlFor={id}>
        {label}
        {customerUid ? ` For ${customerUid}` : ""}
      </FieldLabel>
      <NativeSelect
        className="w-full"
        defaultValue={defaultValue ?? ""}
        form={formId}
        id={id}
        name={name}
        required
      >
        <NativeSelectOption value="">Select {label}</NativeSelectOption>
        {visibleOptions.map((option) => (
          <NativeSelectOption key={option} value={option}>
            {option}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </Field>
  )
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{
    masterView?: string | string[]
    page?: string | string[]
  }>
}) {
  const params = await searchParams
  const activeView = externalMasterView(params.masterView)
  const showDataEntry = activeView === "dataEntry"
  const showMasterTables = activeView === "masterTables"
  const bounds = pageBounds(params.page, 15)
  const session = await requireCapability(
    "pricing.customers.read",
    "/commercial/customers"
  )
  const grantedCapabilities = await listGrantedCapabilities(session.user.id, [
    commercialTaskCapabilities.createCustomer,
    commercialTaskCapabilities.updateCustomer,
  ])
  const canCreateCustomers = grantedCapabilities.includes(
    commercialTaskCapabilities.createCustomer
  )
  const canUpdateCustomers = grantedCapabilities.includes(
    commercialTaskCapabilities.updateCustomer
  )

  const repository = createCustomerRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const masterRepository = createCommercialMasterRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const { customerPage, masterSnapshot } = await (async () => {
    try {
      const organizationId = await repository.organizationIdForCode("MRMPL")
      const [customers, masters] = await Promise.all([
        repository.listPageForOrganization("MRMPL", bounds),
        masterRepository.snapshot(organizationId),
      ])
      return { customerPage: customers, masterSnapshot: masters }
    } finally {
      await repository.close()
      await masterRepository.close()
    }
  })()
  const termOptions = commercialTermOptions(masterSnapshot.commercialTerms)
  const visibleCustomers = customerPage.rows
  if (!visibleCustomers.length && bounds.page > 1) {
    redirect(externalMasterViewHref(customersPath, "masterTables"))
  }
  const totalCount = customerPage.coverage.total ?? 0
  const totalPages = Math.max(1, Math.ceil(totalCount / bounds.limit))

  return (
    <div className="flex flex-col gap-6">
      <MasterDataViewTabs
        activeView={activeView}
        allMastersHref={externalMasterAllMastersHref(activeView)}
        csvDownloadAction={
          <MasterDataCsvDownloadButton
            columns={[
              "company_name",
              "country",
              "default_buyer_name",
              "default_currency",
              "default_incoterms",
              "default_packaging_terms",
              "default_payment_terms",
              "default_shipment_mode",
              "email",
              "phone",
              "status",
            ]}
            fileName="customer-master-template.csv"
          />
        }
        csvImportAction={
          canCreateCustomers ? (
            <MasterDataCsvImportButton action={importCustomersCsvAction} />
          ) : null
        }
        dataEntryHref={externalMasterViewHref(customersPath, "dataEntry")}
        exportAction={
          <DataDownloadButton
            href={`${customersPath}/export.csv`}
            label="Download CSV"
          />
        }
        masterTablesHref={externalMasterViewHref(customersPath, "masterTables")}
      />

      {showMasterTables ? (
        <MetricSummary
          scope={`Customer register · page ${bounds.page} of ${totalPages} · before table filters`}
          items={[
            {
              label: "Total Customers",
              value: customerPage.coverage.total ?? "—",
              tone: "information"
            },
            { label: "On This Page", value: visibleCustomers.length },
            {
              label: "Active on Page",
              value: visibleCustomers.filter((row) => row.status === "Active")
                .length,
              tone: "positive"
            }
          ]}
        />
      ) : null}

      {canCreateCustomers && showDataEntry ? (
 <SectionCard>
          <CardHeader>
            <CardTitle>Add Customer</CardTitle>
            <CardDescription>
              Customer Ids Are Allocated From The Pricing Customer Sequence.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5">
            <CompanyWideMasterScope />
            <form action={createCustomerAction}>
              <FieldGroup className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Field>
                  <FieldLabel htmlFor="new-company-name">
                    Company Name
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
                <CustomerDefaultSelect
                  label="Buyer"
                  name="default_buyer_name"
                  options={termOptions.buyer}
                />
                <CustomerDefaultSelect
                  label="Incoterms"
                  name="default_incoterms"
                  options={termOptions.incoterms}
                />
                <CustomerDefaultSelect
                  label="Payment Terms"
                  name="default_payment_terms"
                  options={termOptions.payment_terms}
                />
                <CustomerDefaultSelect
                  label="Shipment Mode"
                  name="default_shipment_mode"
                  options={termOptions.shipment_mode}
                />
                <CustomerDefaultSelect
                  label="Packaging"
                  name="default_packaging_terms"
                  options={termOptions.packaging_terms}
                />
                <CustomerDefaultSelect
                  label="Currency"
                  name="default_currency"
                  options={termOptions.currency}
                />
              </FieldGroup>
              <Button className="mt-6" type="submit">
                Add Customer
              </Button>
            </form>
          </CardContent>
 </SectionCard>
      ) : null}

      {showMasterTables ? (
 <SectionCard>
          <CardHeader>
            <CardTitle>Customers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
              <span>
                Showing {visibleCustomers.length ? bounds.offset + 1 : 0}–
                {Math.min(bounds.offset + visibleCustomers.length, totalCount)}{" "}
                Of {totalCount} Customers
              </span>
              <div className="flex items-center gap-2">
                {bounds.page > 1 ? (
                  <Button asChild size="sm" variant="outline">
                    <a
                      href={externalMasterViewHref(
                        customersPath,
                        "masterTables",
                        { page: String(bounds.page - 1) }
                      )}
                    >
                      Previous
                    </a>
                  </Button>
                ) : (
                  <Button disabled size="sm" variant="outline">
                    Previous
                  </Button>
                )}
                <span>
                  Page {Math.min(bounds.page, totalPages)} Of {totalPages}
                </span>
                {bounds.page < totalPages ? (
                  <Button asChild size="sm" variant="outline">
                    <a
                      href={externalMasterViewHref(
                        customersPath,
                        "masterTables",
                        { page: String(bounds.page + 1) }
                      )}
                    >
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
 <OperationalTable>
                <TableHeader>
                  <TableRow>
                    <TableHead data-filterable="true">Customer Id</TableHead>
                    <TableHead data-filterable="true">Company</TableHead>
                    <TableHead data-filterable="true">Email</TableHead>
                    <TableHead data-filterable="true">Phone</TableHead>
                    <TableHead data-filterable="true">Country</TableHead>
                    <TableHead data-filterable="true">Buyer</TableHead>
                    <TableHead data-filterable="true">Incoterms</TableHead>
                    <TableHead data-filterable="true">Payment Terms</TableHead>
                    <TableHead data-filterable="true">Shipment Mode</TableHead>
                    <TableHead data-filterable="true">Packaging</TableHead>
                    <TableHead data-filterable="true">Currency</TableHead>
                    <TableHead data-filterable="true">Status</TableHead>
                    {canUpdateCustomers ? <TableHead>Action</TableHead> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleCustomers.length ? (
                    visibleCustomers.map((customer) => {
                      const formId = `customer-${customer.id}`
                      return (
                        <TableRow key={customer.id}>
                          <TableCell
                            className="font-medium"
                            data-filter-value={customer.customerUid}
                          >
                            {canUpdateCustomers ? (
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
                          <TableCell data-filter-value={customer.companyName}>
                            {canUpdateCustomers ? (
                              <Field className="min-w-52">
                                <FieldLabel
                                  className="sr-only"
                                  htmlFor={`${formId}-company`}
                                >
                                  Company Name For {customer.customerUid}
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
                          <TableCell data-filter-value={customer.email ?? ""}>
                            {canUpdateCustomers ? (
                              <Field className="min-w-52">
                                <FieldLabel
                                  className="sr-only"
                                  htmlFor={`${formId}-email`}
                                >
                                  Email For {customer.customerUid}
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
                          <TableCell data-filter-value={customer.phone ?? ""}>
                            {canUpdateCustomers ? (
                              <Field className="min-w-44">
                                <FieldLabel
                                  className="sr-only"
                                  htmlFor={`${formId}-phone`}
                                >
                                  Phone For {customer.customerUid}
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
                          <TableCell data-filter-value={customer.country ?? ""}>
                            {canUpdateCustomers ? (
                              <Field className="min-w-36">
                                <FieldLabel
                                  className="sr-only"
                                  htmlFor={`${formId}-country`}
                                >
                                  Country For {customer.customerUid}
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
                          <TableCell
                            data-filter-value={customer.defaultBuyerName ?? ""}
                          >
                            {canUpdateCustomers ? (
                              <CustomerDefaultSelect
                                customerUid={customer.customerUid}
                                defaultValue={customer.defaultBuyerName}
                                formId={formId}
                                label="Buyer"
                                name="default_buyer_name"
                                options={termOptions.buyer}
                              />
                            ) : (
                              customer.defaultBuyerName || "—"
                            )}
                          </TableCell>
                          <TableCell
                            data-filter-value={customer.defaultIncoterms ?? ""}
                          >
                            {canUpdateCustomers ? (
                              <CustomerDefaultSelect
                                customerUid={customer.customerUid}
                                defaultValue={customer.defaultIncoterms}
                                formId={formId}
                                label="Incoterms"
                                name="default_incoterms"
                                options={termOptions.incoterms}
                              />
                            ) : (
                              customer.defaultIncoterms || "—"
                            )}
                          </TableCell>
                          <TableCell
                            data-filter-value={
                              customer.defaultPaymentTerms ?? ""
                            }
                          >
                            {canUpdateCustomers ? (
                              <CustomerDefaultSelect
                                customerUid={customer.customerUid}
                                defaultValue={customer.defaultPaymentTerms}
                                formId={formId}
                                label="Payment Terms"
                                name="default_payment_terms"
                                options={termOptions.payment_terms}
                              />
                            ) : (
                              customer.defaultPaymentTerms || "—"
                            )}
                          </TableCell>
                          <TableCell
                            data-filter-value={
                              customer.defaultShipmentMode ?? ""
                            }
                          >
                            {canUpdateCustomers ? (
                              <CustomerDefaultSelect
                                customerUid={customer.customerUid}
                                defaultValue={customer.defaultShipmentMode}
                                formId={formId}
                                label="Shipment Mode"
                                name="default_shipment_mode"
                                options={termOptions.shipment_mode}
                              />
                            ) : (
                              customer.defaultShipmentMode || "—"
                            )}
                          </TableCell>
                          <TableCell
                            data-filter-value={
                              customer.defaultPackagingTerms ?? ""
                            }
                          >
                            {canUpdateCustomers ? (
                              <CustomerDefaultSelect
                                customerUid={customer.customerUid}
                                defaultValue={customer.defaultPackagingTerms}
                                formId={formId}
                                label="Packaging"
                                name="default_packaging_terms"
                                options={termOptions.packaging_terms}
                              />
                            ) : (
                              customer.defaultPackagingTerms || "—"
                            )}
                          </TableCell>
                          <TableCell
                            data-filter-value={customer.defaultCurrency ?? ""}
                          >
                            {canUpdateCustomers ? (
                              <CustomerDefaultSelect
                                customerUid={customer.customerUid}
                                defaultValue={customer.defaultCurrency}
                                formId={formId}
                                label="Currency"
                                name="default_currency"
                                options={termOptions.currency}
                              />
                            ) : (
                              customer.defaultCurrency || "—"
                            )}
                          </TableCell>
                          <TableCell data-filter-value={customer.status}>
                            {canUpdateCustomers ? (
                              <Field className="min-w-32">
                                <FieldLabel
                                  className="sr-only"
                                  htmlFor={`${formId}-status`}
                                >
                                  Status For {customer.customerUid}
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
                              <Badge variant="secondary">
                                {customer.status}
                              </Badge>
                            )}
                          </TableCell>
                          {canUpdateCustomers ? (
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
                        colSpan={canUpdateCustomers ? 13 : 12}
                      >
                        No Customers Have Been Loaded Into Postgresql Yet.
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
