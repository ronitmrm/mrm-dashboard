import { MasterEntryForm } from "@/components/master-entry-form"

import {
  createCommercialMasterRepository,
  createCustomerRepository,
} from "@workspace/db"
import { notFound, redirect } from "next/navigation"
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
import { Textarea } from "@workspace/ui/components/textarea"
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
  defaultValue,
  label,
  name,
  options,
}: {
  defaultValue?: string | null
  label: string
  name: string
  options: string[]
}) {
  const id = `new-${name}`
  const visibleOptions =
    defaultValue && !options.includes(defaultValue)
      ? [defaultValue, ...options]
      : options
  return (
    <Field>
      <FieldLabel htmlFor={id}>
        {label}
      </FieldLabel>
      <NativeSelect
        className="w-full"
        defaultValue={defaultValue ?? ""}
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
    edit?: string
  }>
}) {
  const params = await searchParams
  const bounds = pageBounds(params.page, 15)
  const session = await requireCapability(
    "masters.universal.commercial_customers.read",
    "/commercial/customers"
  )
  const grantedCapabilities = await listGrantedCapabilities(session.user.id, [
    "masters.universal.commercial_customers.create",
    "masters.universal.commercial_customers.update",
    "masters.universal.commercial_customers.import",
  ])
  const canCreateCustomers = grantedCapabilities.includes(
    "masters.universal.commercial_customers.create"
  )
  const canUpdateCustomers = grantedCapabilities.includes(
    "masters.universal.commercial_customers.update"
  )
  const canImportCustomers = grantedCapabilities.includes(
    "masters.universal.commercial_customers.import"
  )
  const activeView = canCreateCustomers || canImportCustomers || canUpdateCustomers
    ? (params.edit && canUpdateCustomers ? "dataEntry" : externalMasterView(params.masterView))
    : "masterTables"
  const showDataEntry = activeView === "dataEntry"
  const showMasterTables = activeView === "masterTables"

  const repository = createCustomerRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const masterRepository = createCommercialMasterRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const { customerPage, masterSnapshot, editingCustomer } = await (async () => {
    try {
      const organizationId = await repository.organizationIdForCode("MRMPL")
      const [customers, masters, selectedCustomer] = await Promise.all([
        repository.listPageForOrganization("MRMPL", bounds),
        masterRepository.snapshot(organizationId),
        params.edit && canUpdateCustomers
          ? repository.getForOrganization(organizationId, params.edit)
          : Promise.resolve(null),
      ])
      return { customerPage: customers, masterSnapshot: masters, editingCustomer: selectedCustomer }
    } finally {
      await repository.close()
      await masterRepository.close()
    }
  })()
  if (params.edit && canUpdateCustomers && !editingCustomer) notFound()
  const termOptions = commercialTermOptions(masterSnapshot.commercialTerms)
  const visibleCustomers = customerPage.rows
  if (showMasterTables && !visibleCustomers.length && bounds.page > 1) {
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
              "address",
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
          canImportCustomers ? (
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
            { tone: "brand", label: "On This Page", value: visibleCustomers.length },
            {
              label: "Active on Page",
              value: visibleCustomers.filter((row) => row.status === "Active")
                .length,
              tone: "positive"
            }
          ]}
        />
      ) : null}

      {(canCreateCustomers || editingCustomer) && showDataEntry ? (
 <SectionCard>
          <CardHeader>
            <CardTitle>{editingCustomer ? "Edit Customer Details" : "Add Customer"}</CardTitle>
            <CardDescription>
              {editingCustomer ? `Customer ID: ${editingCustomer.customerUid}` : "Customer Ids Are Allocated From The Pricing Customer Sequence."}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5">
            <CompanyWideMasterScope />
            <MasterEntryForm key={editingCustomer?.id ?? "new"} action={editingCustomer ? updateCustomerAction : createCustomerAction}>
              {editingCustomer ? <input type="hidden" name="customer_id" value={editingCustomer.id} /> : null}
              <input type="hidden" name="page" value={bounds.page} />
              <FieldGroup className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Field>
                  <FieldLabel htmlFor="new-company-name">
                    Company Name
                  </FieldLabel>
                  <Input id="new-company-name" defaultValue={editingCustomer?.companyName ?? ""} name="company_name" required />
                </Field>
                <Field>
                  <FieldLabel htmlFor="new-email">Email</FieldLabel>
                  <Input id="new-email" defaultValue={editingCustomer?.email ?? ""} name="email" type="email" />
                </Field>
                <Field>
                  <FieldLabel htmlFor="new-phone">Phone</FieldLabel>
                  <Input id="new-phone" defaultValue={editingCustomer?.phone ?? ""} name="phone" />
                </Field>
                <Field>
                  <FieldLabel htmlFor="new-address">Address</FieldLabel>
                  <Textarea id="new-address" defaultValue={editingCustomer?.address ?? ""} name="address" />
                </Field>
                <Field>
                  <FieldLabel htmlFor="new-country">Country</FieldLabel>
                  <Input id="new-country" defaultValue={editingCustomer?.country ?? ""} name="country" />
                </Field>
                <Field>
                  <FieldLabel htmlFor="new-status">Status</FieldLabel>
                  <NativeSelect
                    className="w-full"
                    defaultValue={editingCustomer?.status ?? "Active"}
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
                  defaultValue={editingCustomer?.defaultBuyerName}
                  name="default_buyer_name"
                  options={termOptions.buyer}
                />
                <CustomerDefaultSelect
                  label="Incoterms"
                  defaultValue={editingCustomer?.defaultIncoterms}
                  name="default_incoterms"
                  options={termOptions.incoterms}
                />
                <CustomerDefaultSelect
                  label="Payment Terms"
                  defaultValue={editingCustomer?.defaultPaymentTerms}
                  name="default_payment_terms"
                  options={termOptions.payment_terms}
                />
                <CustomerDefaultSelect
                  label="Shipment Mode"
                  defaultValue={editingCustomer?.defaultShipmentMode}
                  name="default_shipment_mode"
                  options={termOptions.shipment_mode}
                />
                <CustomerDefaultSelect
                  label="Packaging"
                  defaultValue={editingCustomer?.defaultPackagingTerms}
                  name="default_packaging_terms"
                  options={termOptions.packaging_terms}
                />
                <CustomerDefaultSelect
                  label="Currency"
                  defaultValue={editingCustomer?.defaultCurrency}
                  name="default_currency"
                  options={termOptions.currency}
                />
              </FieldGroup>
              <Button className="mt-6" type="submit">
                {editingCustomer ? "Edit Customer Details" : "Add Customer"}
              </Button>
              {editingCustomer ? <Button asChild className="mt-6 ml-2" variant="outline"><a href={externalMasterViewHref(customersPath, "masterTables", { page: String(bounds.page) })}>Cancel</a></Button> : null}
            </MasterEntryForm>
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
            <div className="rounded-3xl border min-w-0">
 <OperationalTable>
                <TableHeader>
                  <TableRow>
                    <TableHead data-filterable="true">Customer Id</TableHead>
                    <TableHead data-filterable="true">Company</TableHead>
                    <TableHead data-filterable="true">Email</TableHead>
                    <TableHead data-filterable="true">Phone</TableHead>
                    <TableHead data-filterable="true">Address</TableHead>
                    <TableHead data-filterable="true">Country</TableHead>
                    <TableHead data-filterable="true">Buyer</TableHead>
                    <TableHead data-filterable="true">Incoterms</TableHead>
                    <TableHead data-filterable="true">Payment Terms</TableHead>
                    <TableHead data-filterable="true">Shipment Mode</TableHead>
                    <TableHead data-filterable="true">Packaging</TableHead>
                    <TableHead data-filterable="true">Currency</TableHead>
                    <TableHead data-filterable="true">Status</TableHead>
                    {canUpdateCustomers ? <TableHead data-filterable="false">Actions</TableHead> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleCustomers.length ? (
                    visibleCustomers.map((customer) => (
                      <TableRow key={customer.id}>
                        <TableCell data-filter-value={customer.customerUid} className="sticky left-0 z-10 bg-background font-medium">{customer.customerUid}</TableCell>
                        <TableCell data-filter-value={customer.companyName ?? ""}>{customer.companyName}</TableCell>
                        <TableCell data-filter-value={customer.email ?? ""}>{customer.email || "—"}</TableCell>
                        <TableCell data-filter-value={customer.phone ?? ""}>{customer.phone || "—"}</TableCell>
                        <TableCell data-filter-value={customer.address ?? ""}><span className="whitespace-pre-line">{customer.address || "—"}</span></TableCell>
                        <TableCell data-filter-value={customer.country ?? ""}>{customer.country || "—"}</TableCell>
                        <TableCell data-filter-value={customer.defaultBuyerName ?? ""}>{customer.defaultBuyerName || "—"}</TableCell>
                        <TableCell data-filter-value={customer.defaultIncoterms ?? ""}>{customer.defaultIncoterms || "—"}</TableCell>
                        <TableCell data-filter-value={customer.defaultPaymentTerms ?? ""}>{customer.defaultPaymentTerms || "—"}</TableCell>
                        <TableCell data-filter-value={customer.defaultShipmentMode ?? ""}>{customer.defaultShipmentMode || "—"}</TableCell>
                        <TableCell data-filter-value={customer.defaultPackagingTerms ?? ""}>{customer.defaultPackagingTerms || "—"}</TableCell>
                        <TableCell data-filter-value={customer.defaultCurrency ?? ""}>{customer.defaultCurrency || "—"}</TableCell>
                        <TableCell data-filter-value={customer.status}><Badge variant="secondary">{customer.status}</Badge></TableCell>
                        {canUpdateCustomers ? <TableCell>
                          <Button asChild size="sm" variant="outline">
                            <a href={externalMasterViewHref(customersPath, "dataEntry", { page: String(bounds.page), edit: customer.id })}>Edit</a>
                          </Button>
                        </TableCell> : null}
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell
                        className="h-32 text-center text-muted-foreground"
                        colSpan={canUpdateCustomers ? 14 : 13}
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
