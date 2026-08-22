import Link from "next/link"

import {
  createCommercialOrdersRepository,
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
  FieldLegend,
  FieldSet,
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
import { istDateValue } from "@/lib/date-time"
import { commercialCapabilities } from "@/lib/auth/commercial-capabilities"
import { requireCapability } from "@/lib/auth/require-capability"
import { BoundedResultNotice } from "@/components/bounded-result-notice"
import { MasterDataCsvImportButton } from "@/components/master-data-csv-import-button"
import { OperationalWorkspaceTabs } from "@/components/operational-workspace-tabs"

import {
  createPurchaseOrderAction,
  importPurchaseOrderCsvAction,
} from "./actions"

export const dynamic = "force-dynamic"

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(value)
}

export default async function PurchaseOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string; operationalView?: string }>
}) {
  await requireCapability(
    commercialCapabilities.purchaseOrders.read,
    "/commercial/orders"
  )
  const connectionString = readAuthEnvironment().connectionString
  const ordersRepository = createCommercialOrdersRepository({
    connectionString,
  })
  const customersRepository = createCustomerRepository({ connectionString })
  const params = await searchParams
  const customerSearch = params.customer?.trim() ?? ""
  const operationalView =
    params.operationalView === "masterTables" ? "masterTables" : "dataEntry"
  const { customerOptions, orders, organizationId } = await (async () => {
    try {
      return {
        customerOptions: await customersRepository.searchForOrganization(
          "MRMPL",
          customerSearch
        ),
        orders: await ordersRepository.listPurchaseOrders("MRMPL"),
        organizationId:
          await customersRepository.organizationIdForCode("MRMPL"),
      }
    } finally {
      await ordersRepository.close()
      await customersRepository.close()
    }
  })()

  return (
    <div className="grid gap-6">
      <OperationalWorkspaceTabs
        activeView={operationalView}
        csvImportAction={
          <MasterDataCsvImportButton
            action={importPurchaseOrderCsvAction}
            fileField="purchase_order_csv_file"
          />
        }
        dataEntryHref="/commercial/orders?operationalView=dataEntry"
        exportAction={
          <>
            <Button asChild size="sm" variant="outline">
              <Link href="/commercial/orders/master/export.xlsx">
                Export PO
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/commercial/orders/pi-master/export.xlsx">
                Export Approved PI
              </Link>
            </Button>
          </>
        }
        masterTablesHref="/commercial/orders?operationalView=masterTables"
      />
      {operationalView === "dataEntry" ? (
        <Card>
          <CardHeader>
            <CardTitle>Import Purchase Order</CardTitle>
            <CardDescription>
              Create The Po Header Manually Or Upload One CSV Containing Its
              Header And Line Items. Matching Uses Active Sent Quote Lineages.
            </CardDescription>
            <div className="flex flex-wrap gap-2 pt-2">
              <Button asChild size="sm" variant="outline">
                <Link href="/commercial/orders/template.csv">CSV Template</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href="/commercial/orders/template.xlsx">
                  Excel Template
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="grid gap-5">
            <form
              className="flex flex-col gap-2 sm:flex-row sm:items-end"
              id="po-customer-search"
            >
              <Field className="max-w-md flex-1">
                <FieldLabel htmlFor="po-customer-query">
                  Find Customer
                </FieldLabel>
                <Input
                  defaultValue={customerSearch}
                  id="po-customer-query"
                  name="customer"
                  placeholder="Customer Uid Or Company"
                />
              </Field>
              <Button type="submit" variant="outline">
                Search
              </Button>
            </form>
            <BoundedResultNotice
              actionHref="#po-customer-search"
              actionLabel="Refine customer search"
              coverage={customerOptions.coverage}
              searchQuery={customerSearch}
              section="Customer options"
            />
            {organizationId && customerOptions.rows.length ? (
              <form action={createPurchaseOrderAction}>
                <input
                  name="organization_id"
                  type="hidden"
                  value={organizationId}
                />
                <FieldSet>
                  <FieldLegend>Purchase-Order Header</FieldLegend>
                  <FieldGroup>
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                      <Field>
                        <FieldLabel htmlFor="po-customer">Customer</FieldLabel>
                        <NativeSelect
                          id="po-customer"
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
                        <FieldLabel htmlFor="po-number">Po Number</FieldLabel>
                        <Input id="po-number" name="po_number" required />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="po-date">Po Date</FieldLabel>
                        <Input
                          defaultValue={istDateValue()}
                          id="po-date"
                          name="po_date"
                          required
                          type="date"
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="po-currency">Currency</FieldLabel>
                        <NativeSelect
                          defaultValue="USD"
                          id="po-currency"
                          name="currency_code"
                        >
                          <NativeSelectOption value="USD">
                            Usd
                          </NativeSelectOption>
                          <NativeSelectOption value="INR">
                            Inr
                          </NativeSelectOption>
                          <NativeSelectOption value="EUR">
                            Eur
                          </NativeSelectOption>
                        </NativeSelect>
                      </Field>
                    </div>
                    <Field>
                      <FieldLabel htmlFor="po-notes">Notes</FieldLabel>
                      <Textarea id="po-notes" name="notes" />
                    </Field>
                    <Button className="w-fit" type="submit">
                      Create Purchase Order
                    </Button>
                  </FieldGroup>
                </FieldSet>
              </form>
            ) : (
              <p className="text-sm text-muted-foreground">
                {customerSearch
                  ? "No Customers Match This Search."
                  : "Load At Least One Customer Before Creating A Purchase Order."}
              </p>
            )}
          </CardContent>
        </Card>
      ) : null}

      {operationalView === "masterTables" ? (
        <Card>
          <CardHeader>
            <CardTitle>Purchase-Order Register</CardTitle>
            <CardDescription>
              Imported, Matched, Pi, Approved, And Cancelled Orders With Their
              Retained Source Prices.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-3xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Po</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Lines</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Po Total</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.length ? (
                    orders.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell className="font-medium">
                          {order.poNumber}
                        </TableCell>
                        <TableCell>{order.companyName}</TableCell>
                        <TableCell>{order.poDate}</TableCell>
                        <TableCell>{order.lineCount}</TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              order.status === "Approved"
                                ? "default"
                                : "secondary"
                            }
                          >
                            {order.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {money(order.totalAmount)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button asChild size="sm" variant="ghost">
                            <Link href={`/commercial/orders/${order.id}`}>
                              Review
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell
                        className="h-32 text-center text-muted-foreground"
                        colSpan={7}
                      >
                        No Purchase Orders Have Been Imported.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
