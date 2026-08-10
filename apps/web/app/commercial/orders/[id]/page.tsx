import Link from "next/link"

import { createCommercialOrdersRepository } from "@workspace/db"
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
import { commercialCapabilities } from "@/lib/auth/commercial-capabilities"
import { requireCapability } from "@/lib/auth/require-capability"

import {
  addPurchaseOrderLineAction,
  approveProformaInvoiceAction,
  cancelPurchaseOrderAction,
  createPoQuoteRequestAction,
  decidePurchaseOrderLinePriceAction,
  generateProformaInvoiceAction,
  importPurchaseOrderWorkbookAction,
  markProformaInvoiceSentAction,
  uploadPurchaseOrderFileAction,
} from "../actions"

function money(value: number | null) {
  if (value === null) return "—"
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 4,
    minimumFractionDigits: 2,
  }).format(value)
}

function statusVariant(status: string) {
  if (["Approved", "Matched"].includes(status)) return "default" as const
  if (["Ambiguous", "Pending Costing Revision"].includes(status)) {
    return "destructive" as const
  }
  return "secondary" as const
}

export default async function PurchaseOrderPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  await requireCapability(
    commercialCapabilities.purchaseOrders.read,
    `/commercial/orders/${id}`
  )
  const repository = createCommercialOrdersRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const order = await repository
    .getPurchaseOrder(id)
    .finally(() => repository.close())
  const closed = ["Approved", "Cancelled"].includes(order.status)
  const nextLineNumber =
    Math.max(0, ...order.lines.map((line) => line.lineNumber)) + 1
  const currentInvoice = order.invoices[0]
  const canGeneratePi =
    order.lines.length > 0 &&
    order.lines.every(
      (line) =>
        line.quoteItemId &&
        line.piPrice !== null &&
        line.decision !== "Pending" &&
        !["Unmatched", "Ambiguous", "Pending Costing Revision"].includes(
          line.matchStatus
        )
    )

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <CardTitle>{order.poNumber}</CardTitle>
                <Badge variant={statusVariant(order.status)}>
                  {order.status}
                </Badge>
              </div>
              <CardDescription>
                {order.companyName} · {order.poDate} · Po Total{" "}
                {money(order.totalAmount)}
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              {order.fileName ? (
                <Button asChild variant="outline">
                  <Link href={`/commercial/orders/${order.id}/file`}>
                    Open {order.fileName}
                  </Link>
                </Button>
              ) : null}
              <Button asChild variant="outline">
                <Link href={`/commercial/orders/${order.id}/export.xlsx`}>
                  Export Po Excel
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/commercial/orders">Purchase-Order Register</Link>
              </Button>
            </div>
          </div>
        </CardHeader>
        {order.cancellationReason ? (
          <CardContent>
            <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
              Cancellation Reason: {order.cancellationReason}
            </div>
          </CardContent>
        ) : null}
      </Card>

      {!closed ? (
        <div className="grid gap-6 xl:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Add Po Line</CardTitle>
              <CardDescription>
                The Part Code Is Matched Only To Active Sent Quotes For This
                Customer. Price Decisions Retain Both Po And System Values.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form action={addPurchaseOrderLineAction}>
                <input
                  name="purchase_order_id"
                  type="hidden"
                  value={order.id}
                />
                <FieldSet>
                  <FieldLegend>Manual Line</FieldLegend>
                  <FieldGroup>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field>
                        <FieldLabel htmlFor="line-number">Line</FieldLabel>
                        <Input
                          defaultValue={nextLineNumber}
                          id="line-number"
                          min="1"
                          name="line_number"
                          required
                          type="number"
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="customer-part-code">
                          Customer Part Code
                        </FieldLabel>
                        <Input
                          id="customer-part-code"
                          name="customer_part_code"
                          required
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="line-quantity">
                          Quantity
                        </FieldLabel>
                        <Input
                          id="line-quantity"
                          min="0.000001"
                          name="quantity"
                          required
                          step="0.000001"
                          type="number"
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="po-price">
                          Po Unit Price
                        </FieldLabel>
                        <Input
                          id="po-price"
                          min="0"
                          name="po_price"
                          required
                          step="0.000001"
                          type="number"
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="line-currency">
                          Currency
                        </FieldLabel>
                        <NativeSelect
                          defaultValue="USD"
                          id="line-currency"
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
                      <Field>
                        <FieldLabel htmlFor="line-description">
                          Description
                        </FieldLabel>
                        <Input id="line-description" name="description" />
                      </Field>
                    </div>
                    <Button className="w-fit" type="submit">
                      Match And Add Line
                    </Button>
                  </FieldGroup>
                </FieldSet>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Excel Line Import</CardTitle>
              <CardDescription>
                First Worksheet, Up To 5 Mb. Supported Headers Include Line,
                Customer Part Code, Quantity, Unit Price, Description, And
                Currency. The Entire Worksheet Commits Or Rolls Back Together.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="mb-4" size="sm" variant="outline">
                <Link href="/commercial/orders/template.xlsx">
                  Download Import Template
                </Link>
              </Button>
              <form action={importPurchaseOrderWorkbookAction}>
                <input
                  name="purchase_order_id"
                  type="hidden"
                  value={order.id}
                />
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="po-workbook">Po Workbook</FieldLabel>
                    <Input
                      accept=".xlsx,.xls"
                      id="po-workbook"
                      name="workbook"
                      required
                      type="file"
                    />
                  </Field>
                  <Button className="w-fit" type="submit" variant="secondary">
                    Import And Match Worksheet
                  </Button>
                </FieldGroup>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Original Po File</CardTitle>
              <CardDescription>
                Retain The Customer-Supplied Pdf, Spreadsheet, Or Document With
                Its Checksum And Audit Trail. Uploading Again Replaces The
                Current Link Without Deleting Retained File Evidence.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form action={uploadPurchaseOrderFileAction}>
                <input
                  name="purchase_order_id"
                  type="hidden"
                  value={order.id}
                />
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="po-source-file">
                      Customer Po File
                    </FieldLabel>
                    <Input
                      id="po-source-file"
                      name="po_file"
                      required
                      type="file"
                    />
                  </Field>
                  <Button className="w-fit" type="submit" variant="secondary">
                    Retain Source File
                  </Button>
                </FieldGroup>
              </form>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Po Lines And Quote Decisions</CardTitle>
          <CardDescription>
            Ambiguous Lineages Never Auto-Match. “Accept Po Price” Creates A
            Visible Costing-Revision Request; “Keep Our Price” Retains The
            Historical System Price For The Pi.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-3xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Line</TableHead>
                  <TableHead>Customer Part</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Po Price</TableHead>
                  <TableHead className="text-right">System Price</TableHead>
                  <TableHead>Match</TableHead>
                  <TableHead>Decision</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {order.lines.length ? (
                  order.lines.map((line) => (
                    <TableRow key={line.id}>
                      <TableCell>{line.lineNumber}</TableCell>
                      <TableCell className="font-medium">
                        {line.customerPartCode}
                      </TableCell>
                      <TableCell>{line.description || "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {money(line.quantity)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {line.currencyCode} {money(line.poPrice)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {money(line.systemPrice)}
                      </TableCell>
                      <TableCell>
                        <div className="grid min-w-40 gap-1">
                          <Badge variant={statusVariant(line.matchStatus)}>
                            {line.matchStatus}
                          </Badge>
                          {line.matchEvidence.candidateLineageCount > 1 ? (
                            <span className="text-xs text-muted-foreground">
                              {line.matchEvidence.candidateLineageCount} Active
                              Lineages
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        {!closed &&
                        line.matchStatus === "Difference" &&
                        line.decision === "Pending" ? (
                          <div className="flex min-w-72 flex-col gap-2">
                            <form action={decidePurchaseOrderLinePriceAction}>
                              <input
                                name="purchase_order_id"
                                type="hidden"
                                value={order.id}
                              />
                              <input
                                name="purchase_order_line_id"
                                type="hidden"
                                value={line.id}
                              />
                              <input
                                name="decision"
                                type="hidden"
                                value="Keep Our Price"
                              />
                              <Button size="sm" type="submit">
                                Keep Our Price
                              </Button>
                            </form>
                            <form action={decidePurchaseOrderLinePriceAction}>
                              <input
                                name="purchase_order_id"
                                type="hidden"
                                value={order.id}
                              />
                              <input
                                name="purchase_order_line_id"
                                type="hidden"
                                value={line.id}
                              />
                              <input
                                name="decision"
                                type="hidden"
                                value="Accept PO Price"
                              />
                              <input
                                name="comment"
                                type="hidden"
                                value="Customer PO price requires costing revision."
                              />
                              <Button size="sm" type="submit" variant="outline">
                                Accept Po Price
                              </Button>
                            </form>
                          </div>
                        ) : !closed &&
                          ["Unmatched", "Ambiguous"].includes(
                            line.matchStatus
                          ) ? (
                          <form action={createPoQuoteRequestAction}>
                            <input
                              name="purchase_order_id"
                              type="hidden"
                              value={order.id}
                            />
                            <input
                              name="purchase_order_line_id"
                              type="hidden"
                              value={line.id}
                            />
                            <Button size="sm" type="submit" variant="outline">
                              Create Quote Request
                            </Button>
                          </form>
                        ) : (
                          <Badge variant="outline">{line.decision}</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      className="h-32 text-center text-muted-foreground"
                      colSpan={8}
                    >
                      Add A Line Or Import The Po Worksheet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Proforma Invoice</CardTitle>
            <CardDescription>
              Pi Lines Copy The Selected Quote Revision And Price. Once Sent,
              Those Historical Values Cannot Be Edited.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {currentInvoice ? (
              <div className="grid gap-4">
                <div className="grid gap-2 rounded-2xl border p-4 text-sm">
                  <div className="flex items-center justify-between gap-4">
                    <span className="font-medium">
                      {currentInvoice.invoiceNumber} · R
                      {currentInvoice.revision}
                    </span>
                    <Badge variant={statusVariant(currentInvoice.status)}>
                      {currentInvoice.status}
                    </Badge>
                  </div>
                  <span className="text-muted-foreground">
                    {currentInvoice.invoiceDate} · Total{" "}
                    {money(currentInvoice.totalAmount)}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button asChild size="sm" variant="outline">
                    <Link
                      href={`/commercial/orders/${order.id}/pi`}
                      target="_blank"
                    >
                      Open Pi Pdf
                    </Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link
                      href={`/commercial/orders/${order.id}/pi.xlsx`}
                    >
                      Export Pi Excel
                    </Link>
                  </Button>
                </div>
                {currentInvoice.status === "Draft" ? (
                  <form action={markProformaInvoiceSentAction}>
                    <input
                      name="purchase_order_id"
                      type="hidden"
                      value={order.id}
                    />
                    <input
                      name="proforma_invoice_id"
                      type="hidden"
                      value={currentInvoice.id}
                    />
                    <Button type="submit">Mark Pi Sent</Button>
                  </form>
                ) : null}
                {currentInvoice.status === "Sent" ? (
                  <form action={approveProformaInvoiceAction}>
                    <input
                      name="purchase_order_id"
                      type="hidden"
                      value={order.id}
                    />
                    <input
                      name="proforma_invoice_id"
                      type="hidden"
                      value={currentInvoice.id}
                    />
                    <Button type="submit">Approve Pi And Release Order</Button>
                  </form>
                ) : null}
              </div>
            ) : (
              <form action={generateProformaInvoiceAction}>
                <input
                  name="purchase_order_id"
                  type="hidden"
                  value={order.id}
                />
                <Button disabled={!canGeneratePi || closed} type="submit">
                  Generate Pi
                </Button>
                {!canGeneratePi ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Resolve Matching And Every Price Decision First.
                  </p>
                ) : null}
              </form>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cancellation</CardTitle>
            <CardDescription>
              Cancellation Never Deletes Source Rows, Historical Quotes, Or
              Audit Events. Approved Orders Cannot Be Cancelled.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={cancelPurchaseOrderAction}>
              <input name="purchase_order_id" type="hidden" value={order.id} />
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="cancellation-reason">
                    Cancellation Reason
                  </FieldLabel>
                  <Textarea
                    disabled={closed}
                    id="cancellation-reason"
                    name="reason"
                    required
                  />
                </Field>
                <Button
                  className="w-fit"
                  disabled={closed}
                  type="submit"
                  variant="destructive"
                >
                  Cancel Purchase Order
                </Button>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
