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
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field"
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
import { istDateValue } from "@/lib/date-time"

import {
  createStorePurchaseOrderAction,
  receiveStoreStockAction,
} from "../actions"

export default async function StoreOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{
    itemTypeId?: string
    quantity?: string
    requestNumber?: string
  }>
}) {
  const requestedOrder = await searchParams
  const session = await requireCapability("store.read", "/store/orders")
  const canManage =
    (await listGrantedCapabilities(session.user.id, ["store.manage"])).length > 0
  const repository = createStoreRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const data = await (async () => {
    const organizationId = await repository.organizationIdForCode("MRMPL")
    const [items, locations, suppliers, orders] = await Promise.all([
      repository.listItemTypes(organizationId),
      repository.listLocations(organizationId),
      repository.listSuppliers(organizationId),
      repository.listPurchaseOrders(organizationId),
    ])
    return { items, locations, orders, suppliers }
  })().finally(() => repository.close())
  const receivableOrders = data.orders.filter((order) =>
    ["Open", "Partially Received"].includes(order.status)
  )
  const requestedItemId = data.items.some(
    (item) => item.id === requestedOrder.itemTypeId
  )
    ? requestedOrder.itemTypeId
    : undefined
  const requestedQuantity =
    Number(requestedOrder.quantity) > 0 ? requestedOrder.quantity : undefined

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">
          Orders & Receipts
        </h2>
        <p className="text-sm text-muted-foreground">
          Every receipt must be entered against an open Purchase Order.
        </p>
      </div>

      {canManage ? (
        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Create Purchase Order</CardTitle>
              <CardDescription>
                {requestedOrder.requestNumber
                  ? `Prefilled from ${requestedOrder.requestNumber}. Select Supplier and enter the agreed price.`
                  : "Purchase Order number is generated automatically."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form action={createStorePurchaseOrderAction}>
                <FieldGroup className="grid gap-4 md:grid-cols-2">
                  <SelectField
                    label="Supplier"
                    name="supplier_id"
                    options={data.suppliers.map((supplier) => ({
                      label: `${supplier.code} — ${supplier.name}`,
                      value: supplier.id,
                    }))}
                  />
                  <SelectField
                    defaultValue={requestedItemId}
                    label="Store Item"
                    name="item_type_id"
                    options={data.items.map((item) => ({
                      label: `${item.typeCode} — ${item.identificationName}`,
                      value: item.id,
                    }))}
                  />
                  <TextField
                    defaultValue={istDateValue()}
                    label="Order Date"
                    name="order_date"
                    required
                    type="date"
                  />
                  <TextField
                    defaultValue={requestedQuantity}
                    label="Quantity"
                    name="quantity"
                    required
                    step="0.001"
                    type="number"
                  />
                  <TextField label="Unit Price" name="unit_price" required step="0.01" type="number" />
                  <TextField label="Remark" name="remark" />
                </FieldGroup>
                <Button
                  className="mt-5"
                  disabled={!data.suppliers.length || !data.items.length}
                  type="submit"
                >
                  Create Purchase Order
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Receive Against Order</CardTitle>
              <CardDescription>
                Supplier, item, and price come from the selected Purchase Order.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form action={receiveStoreStockAction} encType="multipart/form-data">
                <FieldGroup className="grid gap-4 md:grid-cols-2">
                  <SelectField
                    label="Open Purchase Order"
                    name="purchase_order_id"
                    options={receivableOrders.map((order) => ({
                      label: `${order.orderNumber} — ${order.supplierName} — ${order.typeCode} — ${order.remainingQuantity} ${order.unit} remaining`,
                      value: order.id,
                    }))}
                  />
                  <SelectField
                    label="Store Location"
                    name="location_id"
                    options={data.locations
                      .filter((location) => location.locationType === "STORE")
                      .map((location) => ({
                        label: `${location.code} — ${location.name}`,
                        value: location.id,
                      }))}
                  />
                  <TextField label="Receipt Quantity" name="quantity" required step="0.001" type="number" />
                  <TextField label="Bill Number" name="bill_number" />
                  <TextField label="Bill Date" name="bill_date" type="date" />
                  <TextField label="Warranty / Guarantee Until" name="warranty_until" type="date" />
                  <TextField label="Received By" name="received_by" />
                  <TextField
                    accept="application/pdf,image/jpeg,image/png"
                    label="Guarantee Card"
                    name="guarantee_card"
                    type="file"
                  />
                </FieldGroup>
                <Button
                  className="mt-5"
                  disabled={!receivableOrders.length || !data.locations.length}
                  type="submit"
                >
                  Receive & Generate Asset Codes
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <Card>
        <CardHeader><CardTitle>Purchase Order Register</CardTitle></CardHeader>
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
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.orders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="font-medium">{order.orderNumber}</TableCell>
                  <TableCell>{order.orderDate}</TableCell>
                  <TableCell>{order.supplierName}</TableCell>
                  <TableCell>{order.typeCode} — {order.itemName}</TableCell>
                  <TableCell>{order.orderedQuantity} {order.unit}</TableCell>
                  <TableCell>{order.receivedQuantity} {order.unit}</TableCell>
                  <TableCell>₹ {order.unitPrice}</TableCell>
                  <TableCell><Badge variant="outline">{order.status}</Badge></TableCell>
                </TableRow>
              ))}
              {!data.orders.length ? (
                <TableRow><TableCell className="h-24 text-center text-muted-foreground" colSpan={8}>No Purchase Orders yet.</TableCell></TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

function TextField({ label, name, ...props }: { label: string; name: string } & React.ComponentProps<typeof Input>) {
  const id = `order-${name}`
  return <Field><FieldLabel htmlFor={id}>{label}</FieldLabel><Input id={id} name={name} {...props} /></Field>
}

function SelectField({
  defaultValue,
  label,
  name,
  options,
}: {
  defaultValue?: string
  label: string
  name: string
  options: { label: string; value: string }[]
}) {
  const id = `order-${name}`
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <NativeSelect defaultValue={defaultValue} id={id} name={name} required>
        {options.map((option) => <NativeSelectOption key={option.value} value={option.value}>{option.label}</NativeSelectOption>)}
      </NativeSelect>
    </Field>
  )
}
