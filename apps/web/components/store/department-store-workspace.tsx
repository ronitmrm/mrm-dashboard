import Link from "next/link"
import { Boxes } from "lucide-react"
import { createDepartmentStoreRepository, createStoreRepository } from "@workspace/db"
import { StatusBadge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { CardContent, CardHeader, CardTitle, SectionCard } from "@workspace/ui/components/card"
import { OperationalTable, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@workspace/ui/components/table"

import { DepartmentStoreForms } from "@/components/store/department-store-forms"
import { DepartmentRepairCompletion } from "@/components/store/department-repair-completion"
import { MetricSummary, PageHeader } from "@/components/ui/golden-patterns"
import { formatIstDateTime } from "@/lib/date-time"

type Workspace = Awaited<ReturnType<ReturnType<typeof createDepartmentStoreRepository>["listStoreWorkspace"]>>
type RepairOrders = Awaited<ReturnType<ReturnType<typeof createStoreRepository>["listPurchaseOrders"]>>

export function DepartmentStoreWorkspace({
  canRepair,
  canRequest,
  canWrite,
  departments,
  machines,
  repairOrders,
  saved,
  vendors,
  workspace,
}: {
  canRepair: boolean
  canRequest: boolean
  canWrite: boolean
  departments: Array<{ code: string; id: string; name: string }>
  machines: Array<{ id: string; machineNumber: string; name: string | null }>
  repairOrders: RepairOrders
  saved: boolean
  vendors: Array<{ code: string; id: string; name: string }>
  workspace: Workspace
}) {
  const { store, stores, consumables, serializedTotals, assets, gaugeSets, movements } = workspace
  const isQuality = store.kind === "QUALITY"
  const isMain = store.kind === "MAIN"
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        description={`Stock accountable to ${store.name}. Physical holder and accountable Store are recorded separately.`}
        icon={Boxes}
        title={isMain ? "Department Transfers" : store.name}
      />
      {canRequest ? (
        <Button asChild className="w-fit" variant="outline">
          <Link href={`/store/requests/new?fulfillmentKind=STORE_TRANSFER&storeCode=${encodeURIComponent(store.code)}`}>
            Request stock or responsibility from Main Store
          </Link>
        </Button>
      ) : null}
      {saved ? <p role="status" className="text-sm">Store movement recorded.</p> : null}
      <MetricSummary
        items={[
          { label: "Consumable codes", value: consumables.length, tone: "information" },
          { label: "Serialized units", value: assets.length, tone: "brand" },
          ...(isQuality ? [{ label: "Gauge sets", value: gaugeSets.length, tone: "accent" as const }] : []),
        ]}
        scope={`Accountable stock in ${store.name}; company quantities include all Stores.`}
      />

      <SectionCard>
        <CardHeader><CardTitle>Consumable stock</CardTitle></CardHeader>
        <CardContent className="min-w-0">
          <OperationalTable filterStorageKey={`department-store-consumables-${store.code}`}>
            <TableHeader><TableRow>
              <TableHead>Asset Code</TableHead><TableHead>Item</TableHead>
              <TableHead>Available to issue here</TableHead><TableHead>Company on hand</TableHead>
              <TableHead>Unit</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {consumables.map((item) => (
                <TableRow key={item.itemTypeId}>
                  <TableCell className="font-medium">{item.typeCode}</TableCell>
                  <TableCell>{item.assetName}</TableCell>
                  <TableCell>{item.availableQuantity}</TableCell>
                  <TableCell>{item.companyQuantity}</TableCell>
                  <TableCell>{item.unit}</TableCell>
                </TableRow>
              ))}
              {!consumables.length ? <TableRow><TableCell colSpan={5}>No consumable stock recorded.</TableCell></TableRow> : null}
            </TableBody>
          </OperationalTable>
        </CardContent>
      </SectionCard>

      <SectionCard>
        <CardHeader><CardTitle>Serialized stock totals</CardTitle></CardHeader>
        <CardContent className="min-w-0">
          <OperationalTable filterStorageKey={`department-store-serialized-totals-${store.code}`}>
            <TableHeader><TableRow>
              <TableHead>Asset Code</TableHead><TableHead>Item</TableHead>
              <TableHead>Available here</TableHead><TableHead>Accountable here</TableHead>
              <TableHead>Company units</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {serializedTotals.map((item) => <TableRow key={item.itemTypeId}>
                <TableCell className="font-medium">{item.typeCode}</TableCell>
                <TableCell>{item.assetName}</TableCell>
                <TableCell>{item.availableQuantity}</TableCell>
                <TableCell>{item.accountableQuantity}</TableCell>
                <TableCell>{item.companyQuantity}</TableCell>
              </TableRow>)}
              {!serializedTotals.length ? <TableRow><TableCell colSpan={5}>No serialized equipment recorded.</TableCell></TableRow> : null}
            </TableBody>
          </OperationalTable>
        </CardContent>
      </SectionCard>

      <SectionCard>
        <CardHeader><CardTitle>Accountable Unit IDs</CardTitle></CardHeader>
        <CardContent className="min-w-0">
          <OperationalTable filterStorageKey={`department-store-assets-${store.code}`}>
            <TableHeader><TableRow>
              <TableHead>Unit ID</TableHead><TableHead>Asset Code</TableHead>
              <TableHead>Item</TableHead><TableHead>Manufacturer ID</TableHead>
              <TableHead>Status</TableHead><TableHead>Physical holder</TableHead><TableHead>Record</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {assets.map((asset) => (
                <TableRow key={asset.assetCode}>
                  <TableCell className="font-medium">{asset.assetCode}</TableCell>
                  <TableCell>{asset.typeCode}</TableCell>
                  <TableCell>{asset.assetName}</TableCell>
                  <TableCell>{asset.manufacturerSerialNumber || "—"}</TableCell>
                  <TableCell><StatusBadge value={asset.status} /></TableCell>
                  <TableCell>{asset.holderName || asset.holderType}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    <div className="flex flex-wrap gap-2">
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/department-store/assets/${encodeURIComponent(asset.assetCode)}?store=${encodeURIComponent(store.code)}`}>
                          History
                        </Link>
                      </Button>
                      {canRepair && asset.status !== "SCRAPPED" ? (
                        <>
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/department-store/repair?store=${encodeURIComponent(store.code)}&asset_code=${encodeURIComponent(asset.assetCode)}`}>
                              Repair PO
                            </Link>
                          </Button>
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/department-store/calibration/${encodeURIComponent(asset.assetCode)}?store=${encodeURIComponent(store.code)}`}>
                              Calibration service
                            </Link>
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {!assets.length ? <TableRow><TableCell colSpan={7}>No serialized units accountable to this Store.</TableCell></TableRow> : null}
            </TableBody>
          </OperationalTable>
        </CardContent>
      </SectionCard>

      <SectionCard>
        <CardHeader><CardTitle>Repair purchase orders</CardTitle></CardHeader>
        <CardContent className="min-w-0">
          <OperationalTable filterStorageKey={`department-store-repairs-${store.code}`}>
            <TableHeader><TableRow>
              <TableHead>PO</TableHead><TableHead>Unit ID</TableHead>
              <TableHead>Repair scope</TableHead><TableHead>Supplier</TableHead>
              <TableHead>Price</TableHead><TableHead>Status</TableHead><TableHead>Return</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {repairOrders.map((order) => <TableRow key={order.id}>
                <TableCell className="font-medium">
                  <Link className="text-primary underline-offset-4 hover:underline" href={`/store/orders/${encodeURIComponent(order.purchaseOrderId)}/pdf`}>
                    {order.orderNumber}
                  </Link>
                </TableCell>
                <TableCell>{order.typeCode}</TableCell>
                <TableCell>{order.itemName}</TableCell>
                <TableCell>{order.supplierName}</TableCell>
                <TableCell>{order.unitPrice}</TableCell>
                <TableCell><StatusBadge value={order.status} /></TableCell>
                <TableCell>{canRepair && order.status === "Open" ? (
                  <DepartmentRepairCompletion
                    assetCode={order.typeCode}
                    purchaseOrderId={order.purchaseOrderId}
                    storeCode={store.code}
                  />
                ) : "—"}</TableCell>
              </TableRow>)}
              {!repairOrders.length ? <TableRow><TableCell colSpan={7}>No repair POs originated here.</TableCell></TableRow> : null}
            </TableBody>
          </OperationalTable>
        </CardContent>
      </SectionCard>

      {isQuality ? (
        <SectionCard>
          <CardHeader><CardTitle>Gauge sets</CardTitle></CardHeader>
          <CardContent className="min-w-0">
            <OperationalTable filterStorageKey="quality-store-gauge-sets">
              <TableHeader><TableRow>
                <TableHead>Set ID</TableHead><TableHead>Name</TableHead>
                <TableHead>Member Unit IDs</TableHead><TableHead>Status</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {gaugeSets.map((set) => (
                  <TableRow key={set.id}>
                    <TableCell className="font-medium">{set.setCode}</TableCell>
                    <TableCell>{set.name}</TableCell>
                    <TableCell>{set.assetCodes.join(" + ")}</TableCell>
                    <TableCell><StatusBadge value={set.status} tone={set.status === "COMPLETE" ? "positive" : "warning"} /></TableCell>
                  </TableRow>
                ))}
                {!gaugeSets.length ? <TableRow><TableCell colSpan={4}>No gauge sets created.</TableCell></TableRow> : null}
              </TableBody>
            </OperationalTable>
          </CardContent>
        </SectionCard>
      ) : null}

      {canWrite ? <DepartmentStoreForms
        assets={assets}
        consumables={consumables}
        departments={departments}
        gaugeSets={gaugeSets}
        machines={machines}
        store={store}
        stores={stores}
        vendors={vendors}
      /> : null}

      <SectionCard>
        <CardHeader><CardTitle>Recent movements</CardTitle></CardHeader>
        <CardContent className="min-w-0">
          <OperationalTable filterStorageKey={`department-store-movements-${store.code}`}>
            <TableHeader><TableRow>
              <TableHead>Date & time</TableHead><TableHead>Item / Unit ID</TableHead>
              <TableHead>Movement</TableHead><TableHead>Quantity</TableHead>
              <TableHead>From</TableHead><TableHead>To</TableHead><TableHead>Recorded by</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {movements.map((movement, index) => (
                <TableRow key={`${movement.subjectCode}-${movement.occurredAt}-${index}`}>
                  <TableCell>{formatIstDateTime(movement.occurredAt)}</TableCell>
                  <TableCell>{movement.subjectCode}</TableCell>
                  <TableCell><StatusBadge value={movement.kind} /></TableCell>
                  <TableCell>{movement.quantity}</TableCell>
                  <TableCell>{movement.from || "—"}</TableCell>
                  <TableCell>{movement.to || "—"}</TableCell>
                  <TableCell>{movement.performedBy || "—"}</TableCell>
                </TableRow>
              ))}
              {!movements.length ? <TableRow><TableCell colSpan={7}>No movements recorded for this Store.</TableCell></TableRow> : null}
            </TableBody>
          </OperationalTable>
        </CardContent>
      </SectionCard>
      <p className="text-xs text-muted-foreground">Store records share the central inventory ledger. A move to a machine, department, or vendor changes the physical holder; only an accountability transfer changes the responsible Store.</p>
    </div>
  )
}
