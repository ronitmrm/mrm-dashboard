import Link from "next/link"
import { createStoreRepository } from "@workspace/db"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
 SectionCard,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
 OperationalTable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"
import { listGrantedStoreActions } from "@/lib/auth/store-action-access"

import { receiveStoreStockAction } from "../actions"

export default async function StoreOrdersPage() {
  const session = await requireCapability(
    "store.purchase_register.read",
    "/store/orders"
  )
  const canManage = (await listGrantedStoreActions(session.user.id)).has(
    "store.receipts.receive"
  )
  const repository = createStoreRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const data = await (async () => {
    const organizationId = await repository.organizationIdForCode("MRMPL")
    return repository.listPurchaseOrders(organizationId)
  })().finally(() => repository.close())

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">
          Purchase Register
        </h2>
        <p className="text-sm text-muted-foreground">
          Purchase Orders are started from Stock. Receive goods against the same
          order row.
        </p>
      </div>

 <SectionCard>
        <CardHeader>
          <CardTitle>Purchase Orders and Receipts</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
 <OperationalTable>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Item</TableHead>
                <TableHead>Ordered</TableHead>
                <TableHead>Received</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Order Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>PO Document</TableHead>
                {canManage ? (
                  <TableHead>Receive Against This Order</TableHead>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((order) => {
                const canReceive =
                  order.orderType === "GOODS" &&
                  order.status !== "Cancelled" &&
                  Number(order.remainingQuantity) > 0
                const emailHref = order.supplierEmail
                  ? `mailto:${order.supplierEmail}?${new URLSearchParams({
                      body: `Please find Purchase Order ${order.orderNumber}. Download the PDF from the MRM Store Purchase Register and attach it to this email.`,
                      subject: `Purchase Order ${order.orderNumber}`,
                    }).toString()}`
                  : null
                return (
                  <TableRow key={order.id}>
                    <TableCell className="font-medium">
                      {order.orderNumber}
                    </TableCell>
                    <TableCell>{order.orderDate}</TableCell>
                    <TableCell>
                      {order.orderType === "REPAIR" ? "Repair" : "Goods"}
                    </TableCell>
                    <TableCell>{order.supplierName}</TableCell>
                    <TableCell>
                      {order.typeCode} — {order.itemName}
                    </TableCell>
                    <TableCell>
                      {order.orderedQuantity} {order.unit}
                    </TableCell>
                    <TableCell>
                      {order.receivedQuantity} {order.unit}
                    </TableCell>
                    <TableCell>₹ {order.unitPrice}</TableCell>
                    <TableCell>₹ {order.orderTotal}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{order.status}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="grid min-w-32 gap-2">
                        <Button asChild size="sm" variant="outline">
                          <Link
                            href={`/store/orders/${encodeURIComponent(order.purchaseOrderId)}/pdf`}
                          >
                            Download PDF
                          </Link>
                        </Button>
                        {emailHref ? (
                          <Button asChild size="sm" variant="outline">
                            <a href={emailHref}>Email Supplier</a>
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            Add Supplier Email in Master
                          </span>
                        )}
                      </div>
                    </TableCell>
                    {canManage ? (
                      <TableCell>
                        {canReceive ? (
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button size="sm">Receive Items</Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>
                                  Receive {order.typeCode}
                                </DialogTitle>
                                <DialogDescription>
                                  {order.orderNumber} ·{" "}
                                  {order.remainingQuantity} {order.unit}{" "}
                                  remaining. Stock will be received into Main
                                  Store under your signed-in ID.
                                </DialogDescription>
                              </DialogHeader>
                              <form
                                action={receiveStoreStockAction}
                                className="grid gap-5"
                                encType="multipart/form-data"
                              >
                                <input
                                  name="purchase_order_line_id"
                                  type="hidden"
                                  value={order.id}
                                />
                                <FieldGroup className="grid gap-4 sm:grid-cols-2">
                                  <Field>
                                    <FieldLabel
                                      htmlFor={`receipt-quantity-${order.id}`}
                                    >
                                      Quantity Received
                                    </FieldLabel>
                                    <Input
                                      defaultValue={order.remainingQuantity}
                                      id={`receipt-quantity-${order.id}`}
                                      max={order.remainingQuantity}
                                      min="0.001"
                                      name="quantity"
                                      required
                                      step="0.001"
                                      type="number"
                                    />
                                  </Field>
                                  <Field>
                                    <FieldLabel
                                      htmlFor={`receipt-bill-number-${order.id}`}
                                    >
                                      Supplier Bill Number (optional)
                                    </FieldLabel>
                                    <Input
                                      id={`receipt-bill-number-${order.id}`}
                                      name="bill_number"
                                    />
                                  </Field>
                                  <Field>
                                    <FieldLabel
                                      htmlFor={`receipt-bill-date-${order.id}`}
                                    >
                                      Supplier Bill Date (optional)
                                    </FieldLabel>
                                    <Input
                                      id={`receipt-bill-date-${order.id}`}
                                      name="bill_date"
                                      type="date"
                                    />
                                  </Field>
                                </FieldGroup>

                                <details className="rounded-lg border px-4 py-3">
                                  <summary className="cursor-pointer font-medium">
                                    Warranty &amp; document (optional)
                                  </summary>
                                  <div className="mt-4 grid gap-4">
                                    <Field>
                                      <FieldLabel
                                        htmlFor={`receipt-warranty-${order.id}`}
                                      >
                                        Warranty / Guarantee Until
                                      </FieldLabel>
                                      <Input
                                        id={`receipt-warranty-${order.id}`}
                                        name="warranty_until"
                                        type="date"
                                      />
                                    </Field>
                                    <Field>
                                      <FieldLabel
                                        htmlFor={`receipt-card-${order.id}`}
                                      >
                                        Warranty / Guarantee Card
                                      </FieldLabel>
                                      <Input
                                        accept="application/pdf,image/jpeg,image/png"
                                        id={`receipt-card-${order.id}`}
                                        name="guarantee_card"
                                        type="file"
                                      />
                                    </Field>
                                  </div>
                                </details>

                                <DialogFooter>
                                  <DialogClose asChild>
                                    <Button type="button" variant="outline">
                                      Cancel
                                    </Button>
                                  </DialogClose>
                                  <Button type="submit">
                                    Receive Into Main Store
                                  </Button>
                                </DialogFooter>
                              </form>
                            </DialogContent>
                          </Dialog>
                        ) : order.orderType === "REPAIR" ? (
                          "Service PO — no stock receipt"
                        ) : (
                          "Fully received"
                        )}
                      </TableCell>
                    ) : null}
                  </TableRow>
                )
              })}
              {!data.length ? (
                <TableRow>
                  <TableCell
                    className="h-24 text-center text-muted-foreground"
                    colSpan={canManage ? 12 : 11}
                  >
                    No Purchase Orders yet. Select an item from Stock to create
                    one.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
 </OperationalTable>
        </CardContent>
 </SectionCard>
    </div>
  )
}
