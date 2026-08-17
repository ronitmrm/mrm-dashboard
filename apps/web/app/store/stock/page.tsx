import Link from "next/link"
import { createStoreRepository } from "@workspace/db"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Field, FieldLabel } from "@workspace/ui/components/field"
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

import { createStorePurchaseOrderAction } from "../actions"

function firstValue(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value) ?? ""
}

export default async function StoreStockPage({
  searchParams,
}: {
  searchParams: Promise<{
    item?: string | string[]
    orderItemId?: string | string[]
    orderQuantity?: string | string[]
    requestNumber?: string | string[]
  }>
}) {
  const session = await requireCapability("store.read", "/store/stock")
  const capabilities = new Set(
    await listGrantedCapabilities(session.user.id, [
      "store.manage",
      "store.requests.write",
    ])
  )
  const params = await searchParams
  const itemQuery = firstValue(params.item).trim()
  const orderItemId = firstValue(params.orderItemId)
  const orderQuantity = firstValue(params.orderQuantity)
  const requestNumber = firstValue(params.requestNumber)
  const repository = createStoreRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const data = await (async () => {
    const organizationId = await repository.organizationIdForCode("MRMPL")
    const [items, suppliers] = await Promise.all([
      repository.listItemTypes(organizationId),
      repository.listSuppliers(organizationId),
    ])
    return { items, suppliers }
  })().finally(() => repository.close())
  const normalizedQuery = itemQuery.toLocaleLowerCase()
  const items = data.items.filter((item) =>
    [item.typeCode, item.identificationName, item.assetName].some((value) =>
      value.toLocaleLowerCase().includes(normalizedQuery)
    )
  )

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Stock</h2>
        <p className="text-sm text-muted-foreground">
          One register for every Consumable and Non Consumable Store item.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Stock Register</CardTitle>
          <CardDescription>
            Search items, view live quantity and storage location, then select
            rows for a Department Request or Purchase Order.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 overflow-x-auto">
          <form className="flex max-w-2xl gap-2">
            <Input
              defaultValue={itemQuery}
              name="item"
              placeholder="Search item code or name"
              type="search"
            />
            <Button type="submit">Search</Button>
          </form>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Request</TableHead>
                <TableHead className="w-16">Order</TableHead>
                <TableHead>Item</TableHead>
                <TableHead>Asset Type</TableHead>
                <TableHead>Quantity</TableHead>
                <TableHead>Storage Location</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <input
                      aria-label={`Request ${item.typeCode} ${item.identificationName}`}
                      className="size-4 accent-primary"
                      disabled={!capabilities.has("store.requests.write")}
                      form="stock-request-form"
                      name="itemTypeId"
                      type="checkbox"
                      value={item.id}
                    />
                  </TableCell>
                  <TableCell>
                    <input
                      aria-label={`Order ${item.typeCode} ${item.identificationName}`}
                      className="size-4 accent-primary"
                      defaultChecked={item.id === orderItemId}
                      disabled={!capabilities.has("store.manage")}
                      form="stock-purchase-form"
                      name="item_type_id"
                      required
                      type="radio"
                      value={item.id}
                    />
                  </TableCell>
                  <TableCell className="font-medium">
                    {item.typeCode}
                    <span className="block text-xs font-normal text-muted-foreground">
                      {item.identificationName}
                    </span>
                  </TableCell>
                  <TableCell>
                    {item.assetType === "NON_CONSUMABLE"
                      ? "Non Consumable"
                      : "Consumable"}
                  </TableCell>
                  <TableCell>
                    {item.availableStock} {item.unit}
                  </TableCell>
                  <TableCell>{item.storageLocations}</TableCell>
                </TableRow>
              ))}
              {!items.length ? (
                <TableRow>
                  <TableCell
                    className="h-24 text-center text-muted-foreground"
                    colSpan={6}
                  >
                    No matching Store items.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>

          <div className="grid gap-5 border-t pt-5 xl:grid-cols-2">
            <form
              action="/store/requests/new"
              id="stock-request-form"
              method="get"
            >
              <p className="mb-3 text-sm text-muted-foreground">
                Tick multiple Request boxes to create one Department Request.
              </p>
              <Button
                disabled={
                  !capabilities.has("store.requests.write") || !items.length
                }
                type="submit"
              >
                Request Selected Items
              </Button>
            </form>

            {capabilities.has("store.manage") ? (
              <form
                action={createStorePurchaseOrderAction}
                className="grid gap-3 sm:grid-cols-2"
                id="stock-purchase-form"
              >
                <Field>
                  <FieldLabel htmlFor="stock-order-supplier">
                    Supplier
                  </FieldLabel>
                  <NativeSelect
                    id="stock-order-supplier"
                    name="supplier_id"
                    required
                  >
                    {data.suppliers.map((supplier) => (
                      <NativeSelectOption key={supplier.id} value={supplier.id}>
                        {supplier.code} — {supplier.name}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
                <Field>
                  <FieldLabel htmlFor="stock-order-quantity">
                    Order Quantity
                  </FieldLabel>
                  <Input
                    defaultValue={orderQuantity}
                    id="stock-order-quantity"
                    min="0.001"
                    name="quantity"
                    required
                    step="0.001"
                    type="number"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="stock-order-price">
                    Unit Price
                  </FieldLabel>
                  <Input
                    id="stock-order-price"
                    min="0"
                    name="unit_price"
                    required
                    step="0.01"
                    type="number"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="stock-order-date">Order Date</FieldLabel>
                  <Input
                    defaultValue={istDateValue()}
                    id="stock-order-date"
                    name="order_date"
                    required
                    type="date"
                  />
                </Field>
                <Field className="sm:col-span-2">
                  <FieldLabel htmlFor="stock-order-remark">Remark</FieldLabel>
                  <Input
                    defaultValue={requestNumber ? `For ${requestNumber}` : ""}
                    id="stock-order-remark"
                    name="remark"
                  />
                </Field>
                <Button
                  className="sm:col-span-2"
                  disabled={!data.suppliers.length || !items.length}
                  type="submit"
                >
                  Make Purchase Order for Selected Item
                </Button>
              </form>
            ) : null}
          </div>

          <p className="text-sm text-muted-foreground">
            Cannot find the item?{" "}
            <Link
              className="font-medium text-foreground underline"
              href="/store/new-item-requests"
            >
              Submit a New Item Request
            </Link>
            .
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
