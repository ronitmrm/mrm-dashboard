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
import { StorePurchaseOrderForm } from "@/components/store/store-purchase-order-form"
import { StoreStockLossForm } from "@/components/store/store-stock-loss-form"
import {
  listGrantedCapabilities,
  requireCapability,
} from "@/lib/auth/require-capability"
import { listGrantedStoreActions } from "@/lib/auth/store-action-access"
import { istDateValue } from "@/lib/date-time"
import { storeAssetWorkspaceHref } from "@/lib/store-asset-workspace"
import { storeStockRows } from "@/lib/store-stock-rows"

import { createStorePurchaseOrdersAction } from "../actions"

function firstValue(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value) ?? ""
}

export default async function StoreStockPage({
  searchParams,
}: {
  searchParams: Promise<{
    mode?: string | string[]
    asset_code?: string | string[]
    issuance_id?: string | string[]
    orderItemId?: string | string[]
    orderQuantity?: string | string[]
    ordersSaved?: string | string[]
    repairOrdersSaved?: string | string[]
    requestNumber?: string | string[]
    saved?: string | string[]
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
          : requestedMode === "adjust" &&
              storeActions.has("store.asset_movement.write")
            ? "adjust"
          : "view"
  const orderItemId = firstValue(params.orderItemId)
  const requestedIssuanceId = firstValue(params.issuance_id)
  const resumingRepairSelection = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(
    requestedIssuanceId
  )
  const repairIssuanceId = resumingRepairSelection
    ? requestedIssuanceId
    : randomUUID()
  const selectedRepairCodes = new Set(
    (Array.isArray(params.asset_code)
      ? params.asset_code
      : params.asset_code
        ? [params.asset_code]
        : []
    ).map((code) => code.toLowerCase())
  )
  const orderQuantity = firstValue(params.orderQuantity)
  const requestNumber = firstValue(params.requestNumber)
  const savedOrderCount = Number(firstValue(params.ordersSaved))
  const repository = createStoreRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const data = await (async () => {
    const organizationId = await repository.organizationIdForCode("MRMPL")
    const [items, supplierPrices, physicalUnits] = await Promise.all(
      [
        repository.listItemTypes(organizationId),
        repository.listSupplierPrices(organizationId),
        repository.listStockPhysicalUnits(organizationId, "COMPANY"),
      ]
    )
    return { items, supplierPrices, physicalUnits }
  })().finally(() => repository.close())
  const stockRows = storeStockRows(data.items, data.physicalUnits)
  const today = istDateValue()
  const actionFormId = "stock-row-action"
  const columnCount = mode === "view" || mode === "adjust"
    ? 14
    : mode === "order" ? 16 : 15

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Stock</h2>
      </div>

      {firstValue(params.saved) === "1" ? (
        <SectionCard role="status">
          <CardContent className="py-4 text-sm">Unit ID loss recorded.</CardContent>
        </SectionCard>
      ) : null}

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

      {Number(firstValue(params.repairOrdersSaved)) > 0 ? (
        <SectionCard role="status">
          <CardContent className="flex flex-wrap items-center gap-3 py-4 text-sm">
            {firstValue(params.repairOrdersSaved)} Repair PO
            {Number(firstValue(params.repairOrdersSaved)) === 1 ? " was" : "s were"} saved.
            {capabilities.has("store.purchase_register.read") ||
            storeActions.has("store.asset_repair.write") ? (
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
            description: "Non Consumable physical units available in Main Store",
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

      {mode === "adjust" ? (
        <StoreStockLossForm
          units={data.physicalUnits.filter((unit) => unit.isMainAccountable)}
        />
      ) : null}

      <SectionCard>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Stock Register</CardTitle>
              <CardDescription>
                {mode === "repair"
                  ? "Select physical Unit IDs, then continue to enter repair details and Suppliers for each unit."
                  : mode === "order"
                    ? "Select Asset Codes and quantities. The cheapest active Supplier quote is selected by default."
                  : "Asset Code rows summarize stock across Stores. Main Available is stock Main Store can issue; Company On Hand includes every accountable Store. Unit ID rows show their status, responsible Store, and physical holder."}
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
              {storeActions.has("store.asset_repair.write") &&
              !capabilities.has("store.purchase_register.read") ? (
                <Button asChild variant="outline">
                  <Link href="/store/orders">Repair Returns</Link>
                </Button>
              ) : null}
              {storeActions.has("store.asset_movement.write") ? (
                <Button
                  asChild
                  variant={mode === "adjust" ? "default" : "outline"}
                >
                  <Link href="/store/stock?mode=adjust">Record Unit ID loss</Link>
                </Button>
              ) : null}
              {mode !== "view" ? (
                <Button asChild variant="ghost">
                  <Link href="/store/stock">
                    {mode === "adjust" ? "Close Loss Form" : "Cancel Selection"}
                  </Link>
                </Button>
              ) : null}
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid min-w-0 gap-4">
          {mode === "request" ? (
            <form action="/store/requests/new" id={actionFormId} method="get" />
          ) : mode === "repair" ? (
            <form action="/store/stock/repair" id={actionFormId} method="get">
              <input name="issuance_id" type="hidden" value={repairIssuanceId} />
            </form>
          ) : null}

          <OperationalTable
            filterStorageKey="store-stock-register-unit-ids"
            filteredSelection={
              mode === "view" || mode === "adjust"
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
                {mode !== "view" && mode !== "adjust" ? <TableHead>Select</TableHead> : null}
                <TableHead data-filterable="true">
                  Asset Code / Unit ID
                </TableHead>
                <TableHead>Asset Category</TableHead>
                <TableHead>Asset Subcategory</TableHead>
                <TableHead>Asset Name</TableHead>
                <TableHead>Make/Model</TableHead>
                <TableHead>Main Available</TableHead>
                <TableHead>Company On Hand</TableHead>
                <TableHead data-filterable="true">Asset Type</TableHead>
                <TableHead>Company Assigned</TableHead>
                <TableHead data-filterable="true">Unit Status</TableHead>
                <TableHead data-filterable="true">Responsible Store</TableHead>
                <TableHead>Location / Holder</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Quote / Purchase Price</TableHead>
                {mode === "order" ? (
                  <TableHead>Order Quantity</TableHead>
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
                const selectedRepairUnit = selectedRepairCodes.has(
                  item.displayedCode.toLowerCase()
                )
                const canSelectRepairUnit =
                  item.physicalUnit &&
                  item.physicalUnit.isMainAccountable &&
                  item.physicalUnit.status !== "SCRAPPED" && item.physicalUnit.status !== "LOST" &&
                  (item.physicalUnit.holderType !== "SUPPLIER" ||
                    (resumingRepairSelection && selectedRepairUnit))
                return (
                  <TableRow key={item.rowKey}>
                    {mode !== "view" && mode !== "adjust" ? (
                      <TableCell>
                        {mode === "repair" ? (
                          canSelectRepairUnit ? (
                            <input
                              aria-label={`Select Unit ID ${item.displayedCode} for repair`}
                              className="size-4 accent-primary"
                              defaultChecked={selectedRepairUnit}
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
                            data-asset-code={item.typeCode}
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
                      data-filter-value={`${item.typeCode} ${item.displayedCode}`}
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
                        {item.physicalUnit
                          ? `Asset Code ${item.typeCode}`
                          : "Asset Code"}
                      </span>
                      {mode === "view" && item.physicalUnit &&
                      capabilities.has("store.asset_history.read") &&
                      storeActions.has("store.receipts.receive") ? (
                        <Link
                          className="block w-fit text-xs font-normal text-primary underline underline-offset-4"
                          href={`${storeAssetWorkspaceHref(item.displayedCode)}#unit-details`}
                        >
                          Edit Unit Details
                        </Link>
                      ) : null}
                    </TableCell>
                    <TableCell>{item.assetCategory}</TableCell>
                    <TableCell>{item.assetSubcategory}</TableCell>
                    <TableCell>{item.assetName}</TableCell>
                    <TableCell>{item.makeModel}</TableCell>
                    <TableCell>{item.availableQuantity}</TableCell>
                    <TableCell>{item.companyQuantity}</TableCell>
                    <TableCell>
                      {item.assetType === "NON_CONSUMABLE"
                        ? "Non Consumable"
                        : "Consumable"}
                    </TableCell>
                    <TableCell>{item.assignedQuantity}</TableCell>
                    <TableCell
                      data-filter-value={item.physicalUnit?.status ?? "—"}
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
                                  : item.physicalUnit.status === "LOST"
                                    ? "danger"
                                    : item.physicalUnit.status === "SCRAPPED"
                                    ? "inactive"
                                    : "warning"
                          }
                          value={item.physicalUnit.status}
                        />
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell data-filter-value={item.physicalUnit?.accountableStoreName ?? "—"}>
                      {item.physicalUnit?.accountableStoreName ?? "—"}
                    </TableCell>
                    <TableCell>
                      {item.physicalUnit
                        ? (item.physicalUnit.locationName ??
                          item.physicalUnit.holderName ??
                          item.physicalUnit.holderType)
                        : item.storageLocations === "Not in stock" &&
                            Number(item.companyOnHand) > 0
                          ? "Not in Main Store"
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
            <StorePurchaseOrderForm
              action={createStorePurchaseOrdersAction}
              formId={actionFormId}
              issuanceId={randomUUID()}
              orderDate={today}
              remark={requestNumber ? `For ${requestNumber}` : ""}
            />
          ) : mode === "repair" ? (
            <Button className="w-fit" form={actionFormId} type="submit">
              Continue with Selected Unit IDs
            </Button>
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
