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
import { requireCapability } from "@/lib/auth/require-capability"
import { formatIstDateTime, istDateValue } from "@/lib/date-time"

export default async function StoreStockPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>
}) {
  await requireCapability("store.read", "/store/stock")
  const rawQuery = (await searchParams).q
  const query = (Array.isArray(rawQuery) ? rawQuery[0] : rawQuery) ?? ""
  const repository = createStoreRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const data = await (async () => {
    const organizationId = await repository.organizationIdForCode("MRMPL")
    const [assets, items, movements] = await Promise.all([
      repository.listAssets({ organizationId, query }),
      repository.listItemTypes(organizationId),
      repository.listRecentStockMovements(organizationId),
    ])
    return { assets, items, movements }
  })().finally(() => repository.close())
  const today = istDateValue()

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Stock</h2>
        <p className="text-sm text-muted-foreground">
          Current balances and immutable inward, issue, return, transfer, and scrap movements.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Current Stock</CardTitle>
          <CardDescription>
            Consumables use ledger quantity; Non Consumables count available Asset Codes.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type Code</TableHead>
                <TableHead>Identification</TableHead>
                <TableHead>Asset Type</TableHead>
                <TableHead>Classification</TableHead>
                <TableHead>Available</TableHead>
                <TableHead>Alert Level</TableHead>
                <TableHead>State</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((item) => {
                const low = Number(item.availableStock) <= Number(item.minimumStock)
                return (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.typeCode}</TableCell>
                    <TableCell>{item.identificationName}</TableCell>
                    <TableCell>
                      {item.assetType === "NON_CONSUMABLE" ? "Non Consumable" : "Consumable"}
                    </TableCell>
                    <TableCell>{item.assetCategory} / {item.assetSubcategory} / {item.assetName}</TableCell>
                    <TableCell>{item.availableStock} {item.unit}</TableCell>
                    <TableCell>{item.minimumStock} {item.unit}</TableCell>
                    <TableCell>
                      <Badge variant={low ? "destructive" : "secondary"}>
                        {low ? "Reorder" : "Available"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                )
              })}
              {!data.items.length ? (
                <TableRow><TableCell className="h-24 text-center text-muted-foreground" colSpan={7}>No Store stock yet.</TableCell></TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card id="asset-register">
        <CardHeader>
          <CardTitle>Non Consumable Asset Register</CardTitle>
          <CardDescription>
            Every physical asset is listed here. Open an Asset Code for its
            movement, calibration, maintenance, supplier, and document history.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 overflow-x-auto">
          <form className="flex max-w-2xl gap-2">
            <Input
              defaultValue={query}
              name="q"
              placeholder="Search Asset Code, item, or current holder"
              type="search"
            />
            <Button type="submit">Search</Button>
          </form>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Asset Code</TableHead>
                <TableHead>Identification</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Current Assignment</TableHead>
                <TableHead>Next Maintenance / Calibration</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.assets.map((asset) => {
                const overdue =
                  asset.nextDueOn !== null && asset.nextDueOn <= today
                const assetHref = `/store/assets/${encodeURIComponent(asset.assetCode)}`
                return (
                  <TableRow key={asset.id}>
                    <TableCell className="font-medium">
                      <Link className="hover:underline" href={assetHref}>
                        {asset.assetCode}
                      </Link>
                      <span className="block text-xs font-normal text-muted-foreground">
                        {asset.typeCode}
                      </span>
                    </TableCell>
                    <TableCell>
                      {asset.identificationName}
                      <span className="block text-xs text-muted-foreground">
                        {asset.assetName}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          asset.status === "BROKEN"
                            ? "destructive"
                            : "secondary"
                        }
                      >
                        {asset.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {asset.holderName ||
                        asset.locationName ||
                        asset.holderType}
                    </TableCell>
                    <TableCell>
                      <span
                        className={
                          overdue ? "font-semibold text-destructive" : ""
                        }
                      >
                        {asset.nextDueOn || "Not scheduled"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Button asChild size="sm" variant="outline">
                        <Link href={assetHref}>Open Asset</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
              {!data.assets.length ? (
                <TableRow>
                  <TableCell
                    className="h-28 text-center text-muted-foreground"
                    colSpan={6}
                  >
                    No matching physical assets.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Stock Movements</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Movement</TableHead>
                <TableHead>Item / Asset</TableHead>
                <TableHead>Quantity</TableHead>
                <TableHead>Store</TableHead>
                <TableHead>Supplier / Bill</TableHead>
                <TableHead>Destination</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.movements.map((movement, index) => (
                <TableRow key={`${movement.typeCode}-${movement.movedAt.toISOString()}-${index}`}>
                  <TableCell>{formatIstDateTime(movement.movedAt)}</TableCell>
                  <TableCell><Badge variant="outline">{movement.movementType}</Badge></TableCell>
                  <TableCell>
                    {movement.typeCode} — {movement.identificationName}
                    <span className="block text-xs text-muted-foreground">
                      {movement.assetCode || "Quantity item"}
                    </span>
                  </TableCell>
                  <TableCell>{movement.quantity} {movement.unit}</TableCell>
                  <TableCell>{movement.locationName}</TableCell>
                  <TableCell>
                    {movement.supplierName || "—"}
                    <span className="block text-xs text-muted-foreground">
                      {movement.billNumber ? `Bill ${movement.billNumber}` : ""}
                    </span>
                  </TableCell>
                  <TableCell>{movement.toHolder || "—"}</TableCell>
                </TableRow>
              ))}
              {!data.movements.length ? (
                <TableRow><TableCell className="h-24 text-center text-muted-foreground" colSpan={7}>No Store movements yet.</TableCell></TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
