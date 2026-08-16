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
  MetricCard,
} from "@workspace/ui/components/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { istDateValue } from "@/lib/date-time"
import { requireCapability } from "@/lib/auth/require-capability"

export default async function StoreOverviewPage() {
  await requireCapability("store.read", "/store")
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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Store</h2>
          <p className="text-sm text-muted-foreground">
            Multi-location stock, returnable assets, requests, movement and
            maintenance.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/store/items">Receive Stock</Link>
          </Button>
          <Button asChild>
            <Link href="/store/requests">New Request</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Store Locations" value={snapshot.locations.length} />
        <MetricCard label="Item Types" value={snapshot.items.length} />
        <MetricCard label="Physical Assets" value={snapshot.assets.length} />
        <MetricCard label="Open Requests" value={openRequests.length} />
        <MetricCard label="Due Maintenance" value={dueAssets.length} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Open Department Requests</CardTitle>
            <CardDescription>
              Available stock is calculated live for every row.
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
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
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Attention Required</CardTitle>
            <CardDescription>
              Stock alerts, missing codes and due maintenance.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Attention
              label="Low Stock Items"
              value={lowStock.length}
              href="/store/items"
            />
            <Attention
              label="Pending Code Requests"
              value={
                snapshot.codeRequests.filter((row) => row.status === "Pending")
                  .length
              }
              href="/store/requests"
            />
            <Attention
              label="Maintenance / Calibration Due"
              value={dueAssets.length}
              href="/store/assets"
            />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function Attention({
  href,
  label,
  value,
}: {
  href: string
  label: string
  value: number
}) {
  return (
    <Link
      className="flex items-center justify-between rounded-lg border p-4 hover:bg-muted/50"
      href={href}
    >
      <span className="font-medium">{label}</span>
      <Badge variant={value ? "destructive" : "secondary"}>{value}</Badge>
    </Link>
  )
}
