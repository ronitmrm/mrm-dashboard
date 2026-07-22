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
                {order.companyName} · {order.poDate} · PO total{" "}
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
                  Export PO Excel
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/commercial/orders">Purchase-order register</Link>
              </Button>
            </div>
          </div>
        </CardHeader>
        {order.cancellationReason ? (
          <CardContent>
            <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
              Cancellation reason: {order.cancellationReason}
            </div>
          </CardContent>
        ) : null}
      </Card>

      {!closed ? (
        <div className="grid gap-6 xl:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Add PO line</CardTitle>
              <CardDescription>
                The part code is matched only to active sent quotes for this
                customer. Price decisions retain both PO and system values.
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
                  <FieldLegend>Manual line</FieldLegend>
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
                          Customer part code
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
                          PO unit price
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
                            USD
                          </NativeSelectOption>
                          <NativeSelectOption value="INR">
                            INR
                          </NativeSelectOption>
                          <NativeSelectOption value="EUR">
                            EUR
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
                      Match and add line
                    </Button>
                  </FieldGroup>
                </FieldSet>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Excel line import</CardTitle>
              <CardDescription>
                First worksheet, up to 5 MB. Supported headers include line,
                customer part code, quantity, unit price, description, and
                currency. The entire worksheet commits or rolls back together.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="mb-4" size="sm" variant="outline">
                <Link href="/commercial/orders/template.xlsx">
                  Download import template
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
                    <FieldLabel htmlFor="po-workbook">PO workbook</FieldLabel>
                    <Input
                      accept=".xlsx,.xls"
                      id="po-workbook"
                      name="workbook"
                      required
                      type="file"
                    />
                  </Field>
                  <Button className="w-fit" type="submit" variant="secondary">
                    Import and match worksheet
                  </Button>
                </FieldGroup>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Original PO file</CardTitle>
              <CardDescription>
                Retain the customer-supplied PDF, spreadsheet, or document with
                its checksum and audit trail. Uploading again replaces the
                current link without deleting retained file evidence.
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
                      Customer PO file
                    </FieldLabel>
                    <Input
                      id="po-source-file"
                      name="po_file"
                      required
                      type="file"
                    />
                  </Field>
                  <Button className="w-fit" type="submit" variant="secondary">
                    Retain source file
                  </Button>
                </FieldGroup>
              </form>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>PO lines and quote decisions</CardTitle>
          <CardDescription>
            Ambiguous lineages never auto-match. “Accept PO price” creates a
            visible costing-revision request; “keep our price” retains the
            historical system price for the PI.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-3xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Line</TableHead>
                  <TableHead>Customer part</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">PO price</TableHead>
                  <TableHead className="text-right">System price</TableHead>
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
                              {line.matchEvidence.candidateLineageCount} active
                              lineages
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
                                Keep our price
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
                                Accept PO price
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
                              Create quote request
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
                      Add a line or import the PO worksheet.
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
            <CardTitle>Proforma invoice</CardTitle>
            <CardDescription>
              PI lines copy the selected quote revision and price. Once sent,
              those historical values cannot be edited.
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
                      Open PI PDF
                    </Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link
                      href={`/commercial/orders/${order.id}/pi.xlsx`}
                    >
                      Export PI Excel
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
                    <Button type="submit">Mark PI sent</Button>
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
                    <Button type="submit">Approve PI and release order</Button>
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
                  Generate PI
                </Button>
                {!canGeneratePi ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Resolve matching and every price decision first.
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
              Cancellation never deletes source rows, historical quotes, or
              audit events. Approved orders cannot be cancelled.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={cancelPurchaseOrderAction}>
              <input name="purchase_order_id" type="hidden" value={order.id} />
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="cancellation-reason">
                    Cancellation reason
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
                  Cancel purchase order
                </Button>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
