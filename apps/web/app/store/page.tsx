import Link from "next/link"
import { createStoreRepository } from "@workspace/db"
import {
  AlertTriangle,
  Boxes,
  Building2,
  ClipboardList,
  Package,
  TableProperties,
  Warehouse,
  Wrench,
} from "lucide-react"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
 SectionCard,
  CardContent,
  CardHeader,
  CardTitle,
  MetricCard,
} from "@workspace/ui/components/card"
import {
 OperationalTable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import {
  DashboardGrid,
 PageHeader,
  DashboardSection,
  DataTableCard,
  StatusSummary,
} from "@/components/dashboard/dashboard-components"
import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"
import { istDateValue } from "@/lib/date-time"

export default async function StoreOverviewPage() {
  await requireCapability("store.overview.read", "/store")
  const repository = createStoreRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const snapshot = await (async () => {
    const organizationId = await repository.organizationIdForCode("MRMPL")
    const [items, requests, assets, codeRequests, locations] =
      await Promise.all([
        repository.listItemTypes(organizationId),
        repository.listRequisitions({ organizationId }),
        repository.listAssets({ organizationId }),
        repository.listCodeRequests(organizationId),
        repository.listLocations(organizationId),
      ])
    return { assets, codeRequests, items, locations, requests: requests.rows }
  })().finally(() => repository.close())

  const openRequests = snapshot.requests.filter((row) =>
    ["Pending", "Partially Issued"].includes(row.status)
  )
  const lowStock = snapshot.items.filter(
    (item) => Number(item.availableStock) <= Number(item.minimumStock)
  )
  const dueAssets = snapshot.assets.filter(
    (asset) => asset.nextDueOn && asset.nextDueOn <= istDateValue()
  )
  const pendingCodeRequests = snapshot.codeRequests.filter(
    (row) => row.status === "Pending"
  ).length

  return (
    <div className="grid gap-6">
 <PageHeader
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/store/orders">Purchase Register</Link>
            </Button>
            <Button asChild>
              <Link href="/store/stock">Select Items</Link>
            </Button>
          </>
        }
        description="Multi-location stock, returnable assets, requests, movement and maintenance."
        icon={Warehouse}
        title="Store"
      />

      <DashboardSection
        description="Current stock, asset, request, and maintenance volume."
        title="Key Performance Indicators"
      >
        <DashboardGrid columns="five">
          <MetricCard
            description="Active stock locations"
            icon={<Building2 aria-hidden="true" />}
            label="Store Locations"
            tone="information"
            value={snapshot.locations.length}
          />
          <MetricCard
            description="Coded inventory types"
            icon={<Boxes aria-hidden="true" />}
            label="Item Types"
            tone="brand"
            value={snapshot.items.length}
          />
          <MetricCard
            description="Tracked returnable units"
            icon={<Package aria-hidden="true" />}
            label="Physical Assets"
            tone="accent"
            value={snapshot.assets.length}
          />
          <MetricCard
            description="Pending or partially issued"
            icon={<ClipboardList aria-hidden="true" />}
            label="Open Requests"
 tone={openRequests.length ? "warning" : "positive"}
            value={openRequests.length}
          />
          <MetricCard
            description="Maintenance or calibration due"
            icon={<Wrench aria-hidden="true" />}
            label="Due Maintenance"
 tone={dueAssets.length ? "danger" : "positive"}
            value={dueAssets.length}
          />
        </DashboardGrid>
      </DashboardSection>

      <DashboardSection
        description="Requests ready for store action and exceptions requiring attention."
        title="Operational Overview"
      >
        <DashboardGrid columns="two">
          <DataTableCard
            description="Available stock is calculated live for every row."
            icon={TableProperties}
            title="Open Department Requests"
          >
            <div className="overflow-x-auto rounded-lg border">
 <OperationalTable>
                <TableHeader>
                  <TableRow>
                    <TableHead>Request</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead>Available</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {openRequests.slice(0, 8).map((request) => (
                    <TableRow key={request.id}>
                      <TableCell className="font-medium">
                        {request.requestNumber}
                      </TableCell>
                      <TableCell>{request.department}</TableCell>
                      <TableCell>{request.identificationName}</TableCell>
                      <TableCell>
                        {request.availableStock} {request.unit}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{request.status}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!openRequests.length ? (
                    <TableRow>
                      <TableCell
                        className="h-24 text-center text-muted-foreground"
                        colSpan={5}
                      >
                        No open requests.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
 </OperationalTable>
            </div>
          </DataTableCard>

 <SectionCard className="h-full">
            <CardHeader className="border-b border-border/70 pb-4">
              <div className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]">
                  <AlertTriangle aria-hidden="true" className="size-4" />
                </span>
                <div>
                  <CardTitle>Attention Required</CardTitle>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-1">
              <StatusSummary
                items={[
                  {
                    href: "/store/stock",
                    label: "Low Stock Items",
 tone: lowStock.length ? "danger" : "positive",
                    value: lowStock.length,
                  },
                  {
                    href: "/store/new-item-requests",
                    label: "Pending Code Requests",
 tone: pendingCodeRequests ? "warning" : "positive",
                    value: pendingCodeRequests,
                  },
                  {
                    href: "/store/stock",
                    label: "Maintenance / Calibration Due",
 tone: dueAssets.length ? "danger" : "positive",
                    value: dueAssets.length,
                  },
                ]}
              />
            </CardContent>
 </SectionCard>
        </DashboardGrid>
      </DashboardSection>
    </div>
  )
}
