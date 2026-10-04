import Link from "next/link"
import { ArrowRightLeft, Boxes, Wrench } from "lucide-react"
import { createDepartmentStoreRepository, createStoreRepository } from "@workspace/db"
import { StatusBadge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { CardContent, CardHeader, CardTitle, SectionCard } from "@workspace/ui/components/card"
import { OperationalTable, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@workspace/ui/components/table"

import { DepartmentStoreForms, type DepartmentStoreAction } from "@/components/store/department-store-forms"
import { DepartmentRepairCompletion } from "@/components/store/department-repair-completion"
import { MetricSummary, PageHeader } from "@/components/ui/golden-patterns"
import { formatIstDateTime } from "@/lib/date-time"

type Workspace = Awaited<ReturnType<ReturnType<typeof createDepartmentStoreRepository>["listStoreWorkspace"]>>
type DepartmentAllocations = Awaited<ReturnType<ReturnType<typeof createDepartmentStoreRepository>["listDepartmentAllocations"]>>
type RepairOrders = Awaited<ReturnType<ReturnType<typeof createStoreRepository>["listPurchaseOrders"]>>

export function DepartmentStoreRegister({ action, basePath, canRepair, canRequest, canWrite,
  departmentAllocations, departments, machines, recorderId, repairOrders, saved, selectedItemIds,
  selectMode: requestedSelectMode, today, vendors, view, workspace,
}: {
  action?: DepartmentStoreAction
  basePath: string
  canRepair: boolean
  canRequest: boolean
  canWrite: boolean
  departmentAllocations: DepartmentAllocations
  departments: Array<{ code: string; id: string; name: string }>
  machines: Array<{ id: string; machineNumber: string; name: string | null }>
  recorderId: string
  repairOrders: RepairOrders
  saved: boolean
  selectedItemIds?: string[]
  selectMode?: "use" | "repair" | "calibration"
  today: string
  vendors: Array<{ code: string; id: string; name: string }>
  view: "stock" | "movement" | "repairs"
  workspace: Workspace
}) {
  const { store, stores, consumables, assets, gaugeSets, movements } = workspace
  const selectMode = canWrite ? requestedSelectMode : undefined
  const isQuality = store.kind === "QUALITY"
  const availableConsumables = consumables.filter((item) => Number(item.availableQuantity) > 0)
  const accountableUnitIds = new Set(assets.map((asset) => asset.assetCode.toLowerCase()))
  const otherStoreAllocations = departmentAllocations.filter((asset) =>
    !accountableUnitIds.has(asset.assetCode.toLowerCase()))
  const stockCount = consumables.length + assets.length + otherStoreAllocations.length
  const selectionFormId = "department-store-stock-selection"
  const selectingAssets = selectMode === "repair" || selectMode === "calibration"
  const selectionAction = selectMode === "repair" ? "/department-store/repair"
    : selectMode === "calibration" ? "/department-store/calibration" : basePath
  return <div className="flex min-w-0 flex-col gap-6">
    <PageHeader
      description={view === "stock"
        ? store.kind === "PRODUCTION"
          ? `Stock accountable to ${store.name}, plus Unit IDs held by its departments. Company on-hand includes all Stores.`
          : `Stock accountable to ${store.name}. Company on-hand includes all Stores.`
        : view === "movement"
          ? `Transfers, physical moves, consumption and adjustments for ${store.name}.`
          : `Supplier repair orders originated by ${store.name}.`}
      icon={view === "stock" ? Boxes : view === "movement" ? ArrowRightLeft : Wrench}
      title={view === "stock" ? store.name : view === "movement" ? "Movement" : "Repair Purchase Orders"}
    />
    {saved ? <p role="status" className="text-sm">Store record saved.</p> : null}

    {view === "stock" ? <>
      {canRequest ? <Button asChild className="w-fit" variant="outline"><Link
        href={`/store/requests/new?fulfillmentKind=STORE_TRANSFER&storeCode=${encodeURIComponent(store.code)}`}>
        Request stock or responsibility from Main Store
      </Link></Button> : null}
      <MetricSummary
        items={[
          { label: "Consumable codes", value: consumables.length, tone: "information" },
          { label: "Accountable Unit IDs", value: assets.filter((asset) =>
            asset.status !== "SCRAPPED" && asset.status !== "LOST").length, tone: "brand" },
          ...(isQuality ? [{ label: "Gauge sets", value: gaugeSets.length, tone: "accent" as const }] : []),
        ]}
        scope={`Stock accountable to ${store.name} · before table filters`}
      />
      {canWrite && action ? <DepartmentStoreForms action={action} assets={assets}
        consumables={consumables} departments={departments} gaugeSets={gaugeSets}
        machines={machines} recorderId={recorderId} selectedItemIds={selectedItemIds} store={store}
        stores={stores} today={today} vendors={vendors} /> : null}
      <SectionCard>
        <CardHeader className="gap-3">
          <CardTitle>Stock Register</CardTitle>
          {store.kind === "PRODUCTION" ? <p className="text-sm text-muted-foreground">
            Units assigned to this floor by another Store appear here for visibility. That Store controls their movements and return.
          </p> : null}
          {canWrite ? <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline"><Link href={`${basePath}?action=quantity`}>Transfer or move stock</Link></Button>
            <Button asChild size="sm" variant="outline"><Link href={`${basePath}?action=accountability`}>Transfer Unit ID responsibility</Link></Button>
            {consumables.length ? <Button asChild size="sm" variant={selectMode === "use" ? "default" : "outline"}>
              <Link href={`${basePath}?select=use`}>Record use</Link>
            </Button> : null}
            <Button asChild size="sm" variant="outline"><Link href={`${basePath}?action=adjust`}>Record Unit ID loss</Link></Button>
            {isQuality ? ([
              ["gauge-create", "Combine gauges"], ["gauge-move", "Move gauge set"],
              ["gauge-replace", "Replace gauge"], ["gauge-disband", "Disband set"],
            ] as const).map(([key, label]) => <Button asChild key={key} size="sm" variant="outline">
              <Link href={`${basePath}?action=${key}`}>{label}</Link>
            </Button>) : null}
            {action ? <Button asChild size="sm" variant="ghost"><Link href={basePath}>Close form</Link></Button> : null}
            {canRepair && assets.length ? <>
              <Button asChild size="sm" variant={selectMode === "repair" ? "default" : "outline"}>
                <Link href={`${basePath}?select=repair`}>Make Repair PO</Link>
              </Button>
              <Button asChild size="sm" variant={selectMode === "calibration" ? "default" : "outline"}>
                <Link href={`${basePath}?select=calibration`}>Calibration service</Link>
              </Button>
            </> : null}
            {selectMode ? <><form action={selectionAction} id={selectionFormId} method="get">
              <input name={selectMode === "use" ? "action" : "store"} type="hidden"
                value={selectMode === "use" ? "consume" : store.code} />
            </form>
              {(selectMode !== "use" || availableConsumables.length > 0) ?
                <Button form={selectionFormId} size="sm" type="submit">Continue with selected items</Button> : null}
              <Button asChild size="sm" variant="ghost"><Link href={basePath}>Cancel selection</Link></Button>
            </> : null}
          </div> : null}
          {selectMode === "use" && !availableConsumables.length ? <p className="text-sm text-muted-foreground">
            No consumables are available in {store.name}. Company on-hand is stock across all Stores;
            {canRequest ? <> <Link className="text-primary underline" href={`/store/requests/new?fulfillmentKind=STORE_TRANSFER&storeCode=${encodeURIComponent(store.code)}`}>
              request a transfer into this Store</Link> before recording use.</> : " arrange a transfer into this Store before recording use."}
          </p> : null}
        </CardHeader>
        <CardContent className="min-w-0">
          <OperationalTable
            filterStorageKey={`department-store-stock-${store.code}`}
            filteredSelection={selectMode ? { checkboxName: selectingAssets ? "asset_code" : "item_type_id" } : undefined}
          >
            <TableHeader><TableRow>
              {selectMode ? <TableHead>Select</TableHead> : null}
              <TableHead>Asset Code</TableHead><TableHead>Unit ID</TableHead><TableHead>Item</TableHead>
              <TableHead>Type</TableHead><TableHead>Available here</TableHead>
              <TableHead>Company on hand</TableHead><TableHead>Status</TableHead>
              <TableHead>Physical holder</TableHead>
              {store.kind === "PRODUCTION" ? <TableHead>Responsible Store</TableHead> : null}
            </TableRow></TableHeader>
            <TableBody>
              {consumables.map((item) => <TableRow key={item.itemTypeId}>
                {selectMode ? <TableCell>{selectMode === "use" && Number(item.availableQuantity) > 0 ? <input
                  aria-label={`Select ${item.typeCode} for use`} form={selectionFormId}
                  name="item_type_id" type="checkbox" value={item.itemTypeId} /> : "—"}</TableCell> : null}
                <TableCell className="font-medium">{item.typeCode}</TableCell>
                <TableCell>—</TableCell><TableCell>{item.assetName}</TableCell>
                <TableCell>Consumable</TableCell><TableCell>{item.availableQuantity} {item.unit}</TableCell>
                <TableCell>{item.companyQuantity} {item.unit}</TableCell>
                <TableCell><StatusBadge value={Number(item.availableQuantity) > 0 ? "AVAILABLE" : "OUT OF STOCK"} /></TableCell>
                <TableCell>{store.name}</TableCell>
                {store.kind === "PRODUCTION" ? <TableCell>{store.name}</TableCell> : null}
              </TableRow>)}
              {assets.map((asset) => <TableRow key={asset.assetCode}>
                {selectMode ? <TableCell>{selectingAssets && asset.status !== "SCRAPPED" && asset.status !== "LOST" ? <input
                  aria-label={`Select ${asset.assetCode} for ${selectMode}`} form={selectionFormId}
                  name="asset_code" type="checkbox" value={asset.assetCode} /> : "—"}</TableCell> : null}
                <TableCell className="font-medium">{asset.typeCode}</TableCell>
                <TableCell><Link className="text-primary underline-offset-4 hover:underline"
                  href={`/department-store/assets/${encodeURIComponent(asset.assetCode)}?store=${encodeURIComponent(store.code)}`}>
                  {asset.assetCode}</Link></TableCell><TableCell>{asset.assetName}</TableCell>
                <TableCell>Non Consumable</TableCell><TableCell>{asset.availableHere ? "1" : "0"}</TableCell>
                <TableCell>{asset.status === "SCRAPPED" || asset.status === "LOST" ? "0" : "1"}</TableCell>
                <TableCell><StatusBadge tone={asset.status === "LOST" ? "danger" : undefined} value={asset.status} /></TableCell>
                <TableCell>{asset.holderName || asset.holderType}</TableCell>
                {store.kind === "PRODUCTION" ? <TableCell>{store.name}</TableCell> : null}
              </TableRow>)}
              {otherStoreAllocations.map((asset) => <TableRow key={asset.assetCode}>
                {selectMode ? <TableCell>—</TableCell> : null}
                <TableCell className="font-medium">{asset.typeCode}</TableCell>
                <TableCell>{asset.assetCode}</TableCell><TableCell>{asset.assetName}</TableCell>
                <TableCell>Non Consumable</TableCell><TableCell>0</TableCell>
                <TableCell>1</TableCell><TableCell><StatusBadge value={asset.status} /></TableCell>
                <TableCell>{asset.departmentName}</TableCell>
                {store.kind === "PRODUCTION" ? <TableCell>{asset.accountableStoreName}</TableCell> : null}
              </TableRow>)}
              {!stockCount ? <TableRow><TableCell colSpan={(selectMode ? 9 : 8) + (store.kind === "PRODUCTION" ? 1 : 0)}>
                {store.kind === "PRODUCTION" ? "No stock or Department allocations recorded." : "No stock accountable to this Store."}
              </TableCell></TableRow> : null}
            </TableBody>
          </OperationalTable>
        </CardContent>
      </SectionCard>
      {isQuality ? <SectionCard><CardHeader><CardTitle>Gauge sets</CardTitle></CardHeader>
        <CardContent className="min-w-0"><OperationalTable filterStorageKey="quality-store-gauge-sets">
          <TableHeader><TableRow><TableHead>Set ID</TableHead><TableHead>Name</TableHead>
            <TableHead>Member Unit IDs</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
          <TableBody>{gaugeSets.map((set) => <TableRow key={set.id}>
            <TableCell>{set.setCode}</TableCell><TableCell>{set.name}</TableCell>
            <TableCell>{set.assetCodes.join(" + ")}</TableCell>
            <TableCell><StatusBadge value={set.status} tone={set.status === "COMPLETE" ? "positive" : "warning"} /></TableCell>
          </TableRow>)}
            {!gaugeSets.length ? <TableRow><TableCell colSpan={4}>No gauge sets created.</TableCell></TableRow> : null}
          </TableBody>
        </OperationalTable></CardContent></SectionCard> : null}
    </> : null}

    {view === "movement" ? <>
      <SectionCard><CardHeader><CardTitle>Movement Register</CardTitle></CardHeader>
        <CardContent className="min-w-0"><OperationalTable filterStorageKey={`department-store-movements-${store.code}`}>
          <TableHeader><TableRow><TableHead>Date & time</TableHead><TableHead>Item / Unit ID</TableHead>
            <TableHead>Movement</TableHead><TableHead>Quantity</TableHead><TableHead>From</TableHead>
            <TableHead>To</TableHead><TableHead>Recorded by</TableHead><TableHead>Remark</TableHead></TableRow></TableHeader>
          <TableBody>{movements.map((movement, index) => <TableRow key={`${movement.subjectCode}-${movement.occurredAt}-${index}`}>
            <TableCell>{formatIstDateTime(movement.occurredAt)}</TableCell><TableCell>{movement.subjectCode}</TableCell>
            <TableCell><StatusBadge value={movement.kind} /></TableCell><TableCell>{movement.quantity}</TableCell>
            <TableCell>{movement.from || "—"}</TableCell><TableCell>{movement.to || "—"}</TableCell>
            <TableCell>{movement.performedBy || "—"}</TableCell><TableCell>{movement.remark || "—"}</TableCell>
          </TableRow>)}
            {!movements.length ? <TableRow><TableCell colSpan={8}>No movements recorded for this Store.</TableCell></TableRow> : null}
          </TableBody>
        </OperationalTable></CardContent></SectionCard>
    </> : null}

    {view === "repairs" ? <SectionCard><CardHeader><CardTitle>Repair purchase orders</CardTitle></CardHeader>
      <CardContent className="min-w-0"><OperationalTable filterStorageKey={`department-store-repairs-${store.code}`}>
        <TableHeader><TableRow><TableHead>PO</TableHead><TableHead>Unit ID</TableHead>
          <TableHead>Repair scope</TableHead><TableHead>Supplier</TableHead><TableHead>Price</TableHead>
          <TableHead>Status</TableHead><TableHead>Return</TableHead></TableRow></TableHeader>
        <TableBody>{repairOrders.map((order) => <TableRow key={order.id}>
          <TableCell><Link className="text-primary underline-offset-4 hover:underline"
            href={`/store/orders/${encodeURIComponent(order.purchaseOrderId)}/pdf`}>{order.orderNumber}</Link></TableCell>
          <TableCell>{order.typeCode}</TableCell><TableCell>{order.itemName}</TableCell>
          <TableCell>{order.supplierName}</TableCell><TableCell>{order.unitPrice}</TableCell>
          <TableCell><StatusBadge value={order.status} /></TableCell>
          <TableCell>{canRepair && order.status === "Open" ? <DepartmentRepairCompletion
            assetCode={order.typeCode} purchaseOrderId={order.purchaseOrderId} storeCode={store.code} /> : "—"}</TableCell>
        </TableRow>)}
          {!repairOrders.length ? <TableRow><TableCell colSpan={7}>No repair POs originated here.</TableCell></TableRow> : null}
        </TableBody>
      </OperationalTable></CardContent></SectionCard> : null}
  </div>
}
