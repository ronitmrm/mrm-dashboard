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

import { createStorePurchaseOrdersAction } from "../actions"

function firstValue(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value) ?? ""
}

function matches(value: string | null, filter: string) {
  return (
    !filter ||
    (value ?? "").toLocaleLowerCase().includes(filter.toLocaleLowerCase())
  )
}

export default async function StoreStockPage({
  searchParams,
}: {
  searchParams: Promise<{
    category?: string | string[]
    code?: string | string[]
    location?: string | string[]
    mode?: string | string[]
    name?: string | string[]
    orderItemId?: string | string[]
    orderQuantity?: string | string[]
    price?: string | string[]
    requestNumber?: string | string[]
    stock?: string | string[]
    subcategory?: string | string[]
    supplier?: string | string[]
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
  const filters = {
    category: firstValue(params.category).trim(),
    code: firstValue(params.code).trim(),
    location: firstValue(params.location).trim(),
    name: firstValue(params.name).trim(),
    price: firstValue(params.price).trim(),
    stock: firstValue(params.stock).trim(),
    subcategory: firstValue(params.subcategory).trim(),
    supplier: firstValue(params.supplier).trim(),
  }
  const requestedMode = firstValue(params.mode)
  const mode =
    requestedMode === "order" && capabilities.has("store.manage")
      ? "order"
      : requestedMode === "request" && capabilities.has("store.requests.write")
        ? "request"
        : "view"
  const orderItemId = firstValue(params.orderItemId)
  const orderQuantity = firstValue(params.orderQuantity)
  const requestNumber = firstValue(params.requestNumber)
  const repository = createStoreRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const allItems = await (async () => {
    const organizationId = await repository.organizationIdForCode("MRMPL")
    return repository.listItemTypes(organizationId)
  })().finally(() => repository.close())
  const items = allItems.filter(
    (item) =>
      matches(item.typeCode, filters.code) &&
      matches(`${item.assetName} ${item.identificationName}`, filters.name) &&
      matches(item.assetCategory, filters.category) &&
      matches(item.assetSubcategory, filters.subcategory) &&
      matches(`${item.availableStock} ${item.unit}`, filters.stock) &&
      matches(item.storageLocations, filters.location) &&
      matches(item.currentSupplierName, filters.supplier) &&
      matches(item.currentUnitPrice, filters.price)
  )
  const filterHref =
    mode === "view" ? "/store/stock" : `/store/stock?mode=${mode}`
  const actionFormId = "stock-row-action"
  const columnCount = mode === "view" ? 8 : mode === "request" ? 9 : 10

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Stock</h2>
        <p className="text-sm text-muted-foreground">
          One filterable table for every Consumable and Non Consumable item.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Stock Register</CardTitle>
              <CardDescription>
                Supplier and price come from the newest effective Supplier Price
                Master entry.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              {capabilities.has("store.requests.write") ? (
                <Button
                  asChild
                  variant={mode === "request" ? "default" : "outline"}
                >
                  <Link href="/store/stock?mode=request">Request Items</Link>
                </Button>
              ) : null}
              {capabilities.has("store.manage") ? (
                <Button
                  asChild
                  variant={mode === "order" ? "default" : "outline"}
                >
                  <Link href="/store/stock?mode=order">
                    Make Purchase Order
                  </Link>
                </Button>
              ) : null}
              {mode !== "view" ? (
                <Button asChild variant="ghost">
                  <Link href="/store/stock">Cancel Selection</Link>
                </Button>
              ) : null}
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 overflow-x-auto">
          <form id="stock-column-filters" method="get">
            {mode !== "view" ? (
              <input name="mode" type="hidden" value={mode} />
            ) : null}
          </form>
          {mode === "request" ? (
            <form action="/store/requests/new" id={actionFormId} method="get" />
          ) : mode === "order" ? (
            <form action={createStorePurchaseOrdersAction} id={actionFormId}>
              <input name="order_date" type="hidden" value={istDateValue()} />
              <input
                name="remark"
                type="hidden"
                value={requestNumber ? `For ${requestNumber}` : ""}
              />
            </form>
          ) : null}

          <Table>
            <TableHeader>
              <TableRow>
                {mode !== "view" ? <TableHead>Select</TableHead> : null}
                <TableHead>Asset Code</TableHead>
                <TableHead>Asset Name</TableHead>
                <TableHead>Asset Category</TableHead>
                <TableHead>Asset Subcategory</TableHead>
                <TableHead>Stock Quantity</TableHead>
                <TableHead>Storage Location</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Master Price</TableHead>
                {mode === "order" ? (
                  <TableHead>Order Quantity</TableHead>
                ) : null}
              </TableRow>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                {mode !== "view" ? <TableHead /> : null}
                <FilterCell name="code" value={filters.code} />
                <FilterCell name="name" value={filters.name} />
                <FilterCell name="category" value={filters.category} />
                <FilterCell name="subcategory" value={filters.subcategory} />
                <FilterCell name="stock" value={filters.stock} />
                <FilterCell name="location" value={filters.location} />
                <FilterCell name="supplier" value={filters.supplier} />
                <TableHead>
                  <div className="grid min-w-36 gap-2">
                    <Input
                      aria-label="Filter Master Price"
                      className="bg-background"
                      defaultValue={filters.price}
                      form="stock-column-filters"
                      name="price"
                      placeholder="Filter"
                    />
                    <div className="flex gap-2">
                      <Button
                        form="stock-column-filters"
                        size="sm"
                        type="submit"
                      >
                        Apply
                      </Button>
                      <Button asChild size="sm" variant="outline">
                        <Link href={filterHref}>Clear</Link>
                      </Button>
                    </div>
                  </div>
                </TableHead>
                {mode === "order" ? <TableHead /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => {
                const hasPrice = Boolean(
                  item.currentSupplierId && item.currentUnitPrice
                )
                return (
                  <TableRow key={item.id}>
                    {mode !== "view" ? (
                      <TableCell>
                        <input
                          aria-label={`Select ${item.typeCode} ${item.identificationName}`}
                          className="size-4 accent-primary"
                          defaultChecked={item.id === orderItemId}
                          disabled={mode === "order" && !hasPrice}
                          form={actionFormId}
                          name={
                            mode === "request" ? "itemTypeId" : "item_type_id"
                          }
                          type="checkbox"
                          value={item.id}
                        />
                      </TableCell>
                    ) : null}
                    <TableCell className="font-medium">
                      {item.typeCode}
                    </TableCell>
                    <TableCell>
                      {item.assetName}
                      <span className="block text-xs text-muted-foreground">
                        {item.identificationName} ·{" "}
                        {item.assetType === "NON_CONSUMABLE"
                          ? "Non Consumable"
                          : "Consumable"}
                      </span>
                    </TableCell>
                    <TableCell>{item.assetCategory}</TableCell>
                    <TableCell>{item.assetSubcategory}</TableCell>
                    <TableCell>
                      {item.availableStock} {item.unit}
                    </TableCell>
                    <TableCell>{item.storageLocations}</TableCell>
                    <TableCell>
                      {item.currentSupplierName ?? (
                        <Badge variant="outline">Price Master Missing</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {item.currentUnitPrice
                        ? `₹ ${item.currentUnitPrice}`
                        : "—"}
                    </TableCell>
                    {mode === "order" ? (
                      <TableCell>
                        <Input
                          aria-label={`Order quantity for ${item.typeCode}`}
                          className="min-w-28"
                          defaultValue={
                            item.id === orderItemId ? orderQuantity : ""
                          }
                          disabled={!hasPrice}
                          form={actionFormId}
                          min="0.001"
                          name={`quantity_${item.id}`}
                          placeholder={item.unit}
                          step="0.001"
                          type="number"
                        />
                      </TableCell>
                    ) : null}
                  </TableRow>
                )
              })}
              {!items.length ? (
                <TableRow>
                  <TableCell
                    className="h-24 text-center text-muted-foreground"
                    colSpan={columnCount}
                  >
                    No Store items match these column filters.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>

          {mode === "request" ? (
            <Button className="w-fit" form={actionFormId} type="submit">
              Continue with Selected Request Items
            </Button>
          ) : mode === "order" ? (
            <div className="flex flex-wrap items-center gap-3">
              <Button className="w-fit" form={actionFormId} type="submit">
                Save Supplier Purchase Orders
              </Button>
              <span className="text-sm text-muted-foreground">
                Selected items are automatically split into one PO per Supplier.
              </span>
            </div>
          ) : null}

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

function FilterCell({ name, value }: { name: string; value: string }) {
  return (
    <TableHead>
      <Input
        aria-label={`Filter ${name}`}
        className="min-w-32 bg-background"
        defaultValue={value}
        form="stock-column-filters"
        name={name}
        placeholder="Filter"
      />
    </TableHead>
  )
}
