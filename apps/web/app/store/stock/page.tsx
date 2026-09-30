import { randomUUID } from "node:crypto"

import Link from "next/link"
import { createStoreRepository } from "@workspace/db"
import { StatusBadge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  SectionCard,
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
  OperationalTable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { MetricSummary } from "@/components/ui/golden-patterns"
import {
  listGrantedCapabilities,
  requireCapability,
} from "@/lib/auth/require-capability"
import { listGrantedStoreActions } from "@/lib/auth/store-action-access"
import { istDateValue } from "@/lib/date-time"
import { storeAssetWorkspaceHref } from "@/lib/store-asset-workspace"
import { storeStockRows } from "@/lib/store-stock-rows"

import {
  createStorePurchaseOrdersAction,
  createStoreRepairPurchaseOrderAction,
} from "../actions"

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
    ordersSaved?: string | string[]
    repairOrderSaved?: string | string[]
    requestNumber?: string | string[]
  }>
}) {
  const session = await requireCapability("store.stock.read", "/store/stock")
  const capabilities = new Set(
    await listGrantedCapabilities(session.user.id, [
      "store.asset_history.read",
      "store.purchase_register.read",
    ])
  )
  const storeActions = await listGrantedStoreActions(session.user.id)
  const params = await searchParams
  const requestedMode = firstValue(params.mode)
  const mode =
    requestedMode === "order" &&
    storeActions.has("store.purchase_orders.create")
      ? "order"
      : requestedMode === "repair" &&
          storeActions.has("store.asset_repair.write")
        ? "repair"
        : requestedMode === "request" &&
            storeActions.has("store.requests.submit")
          ? "request"
          : "view"
  const orderItemId = firstValue(params.orderItemId)
  const orderQuantity = firstValue(params.orderQuantity)
  const requestNumber = firstValue(params.requestNumber)
  const savedOrderCount = Number(firstValue(params.ordersSaved))
  const repository = createStoreRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const data = await (async () => {
    const organizationId = await repository.organizationIdForCode("MRMPL")
    const [items, supplierPrices, physicalUnits, suppliers] = await Promise.all(
      [
        repository.listItemTypes(organizationId),
        repository.listSupplierPrices(organizationId),
        repository.listStockPhysicalUnits(organizationId),
        mode === "repair"
          ? repository.listSuppliers(organizationId)
          : Promise.resolve([]),
      ]
    )
    return { items, supplierPrices, physicalUnits, suppliers }
  })().finally(() => repository.close())
  const stockRows = storeStockRows(data.items, data.physicalUnits)
  const today = istDateValue()
  const actionFormId = "stock-row-action"
  const columnCount =
    mode === "view" ? 9 : mode === "request" ? 10 : mode === "repair" ? 12 : 11

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Stock</h2>
      </div>

      {Number.isInteger(savedOrderCount) && savedOrderCount > 0 ? (
        <SectionCard role="status">
          <CardContent className="flex flex-wrap items-center gap-3 py-4 text-sm">
            <span>
              {savedOrderCount} supplier purchase order
              {savedOrderCount === 1 ? " was" : "s were"} saved.
            </span>
            {capabilities.has("store.purchase_register.read") ? (
              <Button asChild size="sm" variant="outline">
                <Link href="/store/orders">Open Purchase Register</Link>
              </Button>
            ) : null}
          </CardContent>
        </SectionCard>
      ) : null}

      {firstValue(params.repairOrderSaved) ? (
        <SectionCard role="status">
          <CardContent className="flex flex-wrap items-center gap-3 py-4 text-sm">
            Repair PO {firstValue(params.repairOrderSaved)} was saved.
            {capabilities.has("store.purchase_register.read") ? (
              <Button asChild size="sm" variant="outline">
                <Link href="/store/orders">Open Purchase Register</Link>
              </Button>
            ) : null}
          </CardContent>
        </SectionCard>
      ) : null}

      <MetricSummary
        scope="Stock register · before table filters"
        items={[
          {
            label: "Asset Codes",
            value: data.items.length,
            tone: "information",
          },
          {
            label: "Available Units",
            value: data.items.reduce(
              (total, item) => total + item.availableUnitIds.length,
              0
            ),
            description: "Non Consumable physical units",
            tone: "positive",
          },
          {
            label: "Out of Stock",
            value: data.items.filter((item) =>
              item.trackingMode === "SERIALIZED"
                ? !item.availableUnitIds.length
                : Number(item.availableStock) <= 0
            ).length,
            description: "Asset codes without available stock",
            tone: "warning",
          },
        ]}
      />

      <SectionCard>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Stock Register</CardTitle>
              <CardDescription>
                {mode === "repair"
                  ? "Select physical Unit IDs, enter each repair scope and agreed price, then choose one Supplier for the Repair PO."
                  : "Asset Codes describe an item type; each Non Consumable unit has its own status, supplier and purchase price. The cheapest active quote is selected by default for a new purchase order."}
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              {storeActions.has("store.requests.submit") ? (
                <Button
                  asChild
                  variant={mode === "request" ? "default" : "outline"}
                >
                  <Link href="/store/stock?mode=request">Request Items</Link>
                </Button>
              ) : null}
              {storeActions.has("store.purchase_orders.create") ? (
                <Button
                  asChild
                  variant={mode === "order" ? "default" : "outline"}
                >
                  <Link href="/store/stock?mode=order">
                    Make Purchase Order
                  </Link>
                </Button>
              ) : null}
              {storeActions.has("store.asset_repair.write") ? (
                <Button
                  asChild
                  variant={mode === "repair" ? "default" : "outline"}
                >
                  <Link href="/store/stock?mode=repair">Make Repair PO</Link>
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
        <CardContent className="grid min-w-0 gap-4">
          {mode === "request" ? (
            <form action="/store/requests/new" id={actionFormId} method="get" />
          ) : mode === "order" ? (
            <form action={createStorePurchaseOrdersAction} id={actionFormId}>
              <input
                defaultValue={randomUUID()}
                name="issuance_id"
                type="hidden"
              />
              <input
                defaultValue={istDateValue()}
                name="order_date"
                type="hidden"
              />
              <input
                defaultValue={requestNumber ? `For ${requestNumber}` : ""}
                name="remark"
                type="hidden"
              />
            </form>
          ) : mode === "repair" ? (
            <form
              action={createStoreRepairPurchaseOrderAction}
              id={actionFormId}
            >
              <input
                defaultValue={randomUUID()}
                name="issuance_id"
                type="hidden"
              />
            </form>
          ) : null}

          <OperationalTable
            filterStorageKey="store-stock-register-unit-ids"
            filteredSelection={
              mode === "view"
                ? undefined
                : {
                    checkboxName:
                      mode === "request"
                        ? "itemTypeId"
                        : mode === "repair"
                          ? "asset_code"
                          : "item_type_id",
                  }
            }
          >
            <TableHeader>
              <TableRow>
                {mode !== "view" ? <TableHead>Select</TableHead> : null}
                <TableHead data-filterable="true">
                  Asset Code / Unit ID
                </TableHead>
                <TableHead>Asset Name</TableHead>
                <TableHead>Asset Category</TableHead>
                <TableHead>Asset Subcategory</TableHead>
                <TableHead>Available Quantity</TableHead>
                <TableHead data-filterable="true">Status</TableHead>
                <TableHead>Location / Holder</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Quote / Purchase Price</TableHead>
                {mode === "order" ? (
                  <TableHead>Order Quantity</TableHead>
                ) : null}
                {mode === "repair" ? (
                  <>
                    <TableHead>Repair Scope</TableHead>
                    <TableHead>Agreed Repair Price</TableHead>
                  </>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {stockRows.map((item) => {
                const supplierOptions = item.actionItem
                  ? data.supplierPrices
                      .filter(
                        (price) =>
                          price.itemTypeId === item.id &&
                          price.active &&
                          price.validFrom <= today
                      )
                      .sort(
                        (left, right) =>
                          Number(left.unitPrice) - Number(right.unitPrice)
                      )
                  : []
                const hasPrice = supplierOptions.length > 0
                const displayedPrice = item.physicalUnit
                  ? item.physicalUnit.unitPrice
                  : item.currentUnitPrice
                return (
                  <TableRow key={item.rowKey}>
                    {mode !== "view" ? (
                      <TableCell>
                        {mode === "repair" ? (
                          item.physicalUnit &&
                          item.physicalUnit.status !== "SCRAPPED" &&
                          item.physicalUnit.holderType !== "SUPPLIER" ? (
                            <input
                              aria-label={`Select Unit ID ${item.displayedCode} for repair`}
                              className="size-4 accent-primary"
                              form={actionFormId}
                              name="asset_code"
                              type="checkbox"
                              value={item.displayedCode}
                            />
                          ) : null
                        ) : item.actionItem ? (
                          <input
                            aria-label={`Select Asset Code ${item.typeCode} ${item.identificationName}`}
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
                        ) : null}
                      </TableCell>
                    ) : null}
                    <TableCell
                      className="font-medium"
                      data-filter-value={item.displayedCode}
                    >
                      {capabilities.has("store.asset_history.read") ? (
                        <Link
                          className="underline decoration-muted-foreground/50 underline-offset-4 hover:decoration-foreground"
                          href={storeAssetWorkspaceHref(item.displayedCode)}
                        >
                          {item.displayedCode}
                        </Link>
                      ) : (
                        item.displayedCode
                      )}
                      <span className="block text-xs font-normal text-muted-foreground">
                        {item.physicalUnit ? "Physical Unit" : "Asset Code"}
                      </span>
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
                    <TableCell>{item.displayedQuantity}</TableCell>
                    <TableCell
                      data-filter-value={
                        item.physicalUnit?.status ?? "Item Type"
                      }
                    >
                      {item.physicalUnit ? (
                        <StatusBadge
                          tone={
                            item.physicalUnit.status === "AVAILABLE"
                              ? "positive"
                              : item.physicalUnit.status === "ASSIGNED"
                                ? "information"
                                : item.physicalUnit.status === "BROKEN"
                                  ? "danger"
                                  : item.physicalUnit.status === "SCRAPPED"
                                    ? "inactive"
                                    : "warning"
                          }
                          value={item.physicalUnit.status}
                        />
                      ) : item.trackingMode === "SERIALIZED" ? (
                        "Item Type"
                      ) : (
                        "Consumable"
                      )}
                    </TableCell>
                    <TableCell>
                      {item.physicalUnit
                        ? (item.physicalUnit.locationName ??
                          item.physicalUnit.holderName ??
                          item.physicalUnit.holderType)
                        : item.storageLocations}
                    </TableCell>
                    <TableCell>
                      {mode === "order" &&
                      item.actionItem &&
                      supplierOptions.length ? (
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
                      ) : item.physicalUnit ? (
                        (item.physicalUnit.supplierName ?? "Not recorded")
                      ) : item.currentSupplierName ? (
                        item.currentSupplierName
                      ) : (
                        "No current quote"
                      )}
                      <span className="block text-xs text-muted-foreground">
                        {item.physicalUnit
                          ? "Purchase supplier"
                          : "Current quote"}
                      </span>
                    </TableCell>
                    <TableCell>
                      {displayedPrice ? `₹ ${displayedPrice}` : "—"}
                      <span className="block text-xs text-muted-foreground">
                        {item.physicalUnit ? "Purchase price" : "Master quote"}
                      </span>
                    </TableCell>
                    {mode === "order" ? (
                      <TableCell>
                        {item.actionItem ? (
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
                        ) : null}
                      </TableCell>
                    ) : null}
                    {mode === "repair" ? (
                      <>
                        <TableCell>
                          {item.physicalUnit &&
                          item.physicalUnit.status !== "SCRAPPED" &&
                          item.physicalUnit.holderType !== "SUPPLIER" ? (
                            <Input
                              aria-label={`Repair scope for ${item.displayedCode}`}
                              className="min-w-48"
                              form={actionFormId}
                              name={`service_description_${item.displayedCode}`}
                              placeholder="Work to be done"
                            />
                          ) : null}
                        </TableCell>
                        <TableCell>
                          {item.physicalUnit &&
                          item.physicalUnit.status !== "SCRAPPED" &&
                          item.physicalUnit.holderType !== "SUPPLIER" ? (
                            <Input
                              aria-label={`Agreed repair price for ${item.displayedCode}`}
                              className="min-w-32"
                              form={actionFormId}
                              min="0"
                              name={`service_price_${item.displayedCode}`}
                              placeholder="₹"
                              step="0.01"
                              type="number"
                            />
                          ) : null}
                        </TableCell>
                      </>
                    ) : null}
                  </TableRow>
                )
              })}
              {!stockRows.length ? (
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
          </OperationalTable>

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
          ) : mode === "repair" ? (
            <div className="grid w-full max-w-2xl gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <label
                  className="text-sm font-medium"
                  htmlFor="repair-supplier"
                >
                  Repair Supplier
                </label>
                <NativeSelect
                  form={actionFormId}
                  id="repair-supplier"
                  name="supplier_id"
                  required
                >
                  <NativeSelectOption value="">
                    Select supplier
                  </NativeSelectOption>
                  {data.suppliers.map((supplier) => (
                    <NativeSelectOption key={supplier.id} value={supplier.id}>
                      {supplier.code} — {supplier.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
              <div className="grid gap-1.5">
                <label
                  className="text-sm font-medium"
                  htmlFor="repair-order-date"
                >
                  PO Date
                </label>
                <Input
                  defaultValue={today}
                  form={actionFormId}
                  id="repair-order-date"
                  name="order_date"
                  type="date"
                />
              </div>
              <div className="grid gap-1.5 sm:col-span-2">
                <label className="text-sm font-medium" htmlFor="repair-remark">
                  Remark (optional)
                </label>
                <Input form={actionFormId} id="repair-remark" name="remark" />
              </div>
              <Button
                className="w-fit"
                disabled={!data.suppliers.length}
                form={actionFormId}
                type="submit"
              >
                Create Repair PO for Selected Units
              </Button>
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
      </SectionCard>
    </div>
  )
}
