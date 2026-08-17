import Link from "next/link"
import { createStoreRepository } from "@workspace/db"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
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

import { readAuthEnvironment } from "@/lib/auth/auth"
import {
  listGrantedCapabilities,
  requireCapability,
} from "@/lib/auth/require-capability"

import { receiveStoreStockAction } from "../actions"

export default async function StoreOrdersPage() {
  const session = await requireCapability("store.read", "/store/orders")
  const canManage = (
    await listGrantedCapabilities(session.user.id, ["store.manage"])
  ).includes("store.manage")
  const repository = createStoreRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const data = await (async () => {
    const organizationId = await repository.organizationIdForCode("MRMPL")
    const [locations, orders] = await Promise.all([
      repository.listLocations(organizationId),
      repository.listPurchaseOrders(organizationId),
    ])
    return {
      locations: locations.filter(
        (location) => location.locationType === "STORE"
      ),
      orders,
    }
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

      <Card>
        <CardHeader>
          <CardTitle>Purchase Orders and Receipts</CardTitle>
          <CardDescription>
            Ordered and received quantities remain together in one register.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Date</TableHead>
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
              {data.orders.map((order) => {
                const canReceive =
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
                          <form
                            action={receiveStoreStockAction}
                            className="grid min-w-96 grid-cols-2 gap-2"
                            encType="multipart/form-data"
                          >
                            <input
                              name="purchase_order_line_id"
                              type="hidden"
                              value={order.id}
                            />
                            <NativeSelect
                              aria-label={`Storage location for ${order.orderNumber}`}
                              name="location_id"
                              required
                            >
                              {data.locations.map((location) => (
                                <NativeSelectOption
                                  key={location.id}
                                  value={location.id}
                                >
                                  {location.code} — {location.name}
                                </NativeSelectOption>
                              ))}
                            </NativeSelect>
                            <Input
                              aria-label={`Receipt quantity for ${order.orderNumber}`}
                              max={order.remainingQuantity}
                              min="0.001"
                              name="quantity"
                              placeholder={`${order.remainingQuantity} ${order.unit} remaining`}
                              required
                              step="0.001"
                              type="number"
                            />
                            <Input
                              name="bill_number"
                              placeholder="Bill Number"
                            />
                            <Input
                              aria-label="Bill Date"
                              name="bill_date"
                              type="date"
                            />
                            <Input
                              aria-label="Warranty or Guarantee Until"
                              name="warranty_until"
                              type="date"
                            />
                            <Input
                              name="received_by"
                              placeholder="Received By"
                            />
                            <Input
                              accept="application/pdf,image/jpeg,image/png"
                              aria-label="Guarantee Card"
                              className="col-span-2"
                              name="guarantee_card"
                              type="file"
                            />
                            <Button
                              className="col-span-2"
                              disabled={!data.locations.length}
                              size="sm"
                              type="submit"
                            >
                              Receive Against Order
                            </Button>
                          </form>
                        ) : (
                          "Fully received"
                        )}
                      </TableCell>
                    ) : null}
                  </TableRow>
                )
              })}
              {!data.orders.length ? (
                <TableRow>
                  <TableCell
                    className="h-24 text-center text-muted-foreground"
                    colSpan={canManage ? 11 : 10}
                  >
                    No Purchase Orders yet. Select an item from Stock to create
                    one.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
