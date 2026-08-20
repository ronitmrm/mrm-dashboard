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
import { istDateValue } from "@/lib/date-time"
import { storeAssetWorkspaceHref } from "@/lib/store-asset-workspace"

import { createStorePurchaseOrdersAction } from "../actions"

function firstValue(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value) ?? ""
}

export default async function StoreStockPage({
  searchParams,
}: {
  searchParams: Promise<{
    mode?: string | string[]
    orderItemId?: string | string[]
    orderQuantity?: string | string[]
    requestNumber?: string | string[]
  }>
}) {
  const session = await requireCapability("store.stock.read", "/store/stock")
  const capabilities = new Set(
    await listGrantedCapabilities(session.user.id, [
      "store.stock.write",
      "store.requests.write",
      "store.asset_history.read",
    ])
  )
  const params = await searchParams
  const requestedMode = firstValue(params.mode)
  const mode =
    requestedMode === "order" && capabilities.has("store.stock.write")
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
  const data = await (async () => {
    const organizationId = await repository.organizationIdForCode("MRMPL")
    const [items, supplierPrices] = await Promise.all([
      repository.listItemTypes(organizationId),
      repository.listSupplierPrices(organizationId),
    ])
    return { items, supplierPrices }
  })().finally(() => repository.close())
  const actionFormId = "stock-row-action"
  const columnCount = mode === "view" ? 9 : mode === "request" ? 10 : 11

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
                The cheapest active quote is selected by default. Store can
                choose another quoted Supplier before saving the PO.
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
              {capabilities.has("store.stock.write") ? (
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
                <TableHead>Available Unit IDs</TableHead>
                <TableHead>Storage Location</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Master Price</TableHead>
                {mode === "order" ? (
                  <TableHead>Order Quantity</TableHead>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((item) => {
                const supplierOptions = data.supplierPrices
                  .filter(
                    (price) =>
                      price.itemTypeId === item.id &&
                      price.active &&
                      price.validFrom <= istDateValue()
                  )
                  .sort(
                    (left, right) =>
                      Number(left.unitPrice) - Number(right.unitPrice)
                  )
                const hasPrice = supplierOptions.length > 0
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
                      {capabilities.has("store.asset_history.read") ? (
                        <Link
                          className="underline decoration-muted-foreground/50 underline-offset-4 hover:decoration-foreground"
                          href={storeAssetWorkspaceHref(item.typeCode)}
                        >
                          {item.typeCode}
                        </Link>
                      ) : (
                        item.typeCode
                      )}
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
                      {item.trackingMode === "SERIALIZED"
                        ? `${item.availableUnitIds.length} physical unit${item.availableUnitIds.length === 1 ? "" : "s"}`
                        : `${item.availableStock} ${item.unit}`}
                    </TableCell>
                    <TableCell>
                      {item.trackingMode === "SERIALIZED" ? (
                        item.availableUnitIds.length ? (
                          <div className="flex min-w-32 flex-col gap-1">
                            {item.availableUnitIds.map((unitId) =>
                              capabilities.has("store.asset_history.read") ? (
                                <Link
                                  className="font-medium underline decoration-muted-foreground/50 underline-offset-4 hover:decoration-foreground"
                                  href={storeAssetWorkspaceHref(unitId)}
                                  key={unitId}
                                >
                                  {unitId}
                                </Link>
                              ) : (
                                <span key={unitId}>{unitId}</span>
                              )
                            )}
                          </div>
                        ) : (
                          "None available"
                        )
                      ) : (
                        "Not applicable"
                      )}
                    </TableCell>
                    <TableCell>{item.storageLocations}</TableCell>
                    <TableCell>
                      {mode === "order" && supplierOptions.length ? (
                        <NativeSelect
                          aria-label={`Supplier for ${item.typeCode}`}
                          defaultValue={item.currentSupplierId ?? undefined}
                          form={actionFormId}
                          name={`supplier_${item.id}`}
                        >
                          {supplierOptions.map((price) => (
                            <NativeSelectOption
                              key={price.id}
                              value={price.supplierId}
                            >
                              {price.supplierName} — ₹ {price.unitPrice}
                            </NativeSelectOption>
                          ))}
                        </NativeSelect>
                      ) : item.currentSupplierName ? (
                        item.currentSupplierName
                      ) : (
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
              {!data.items.length ? (
                <TableRow>
                  <TableCell
                    className="h-24 text-center text-muted-foreground"
                    colSpan={columnCount}
                  >
                    No Store items available.
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
