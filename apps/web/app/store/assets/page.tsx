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
import { istDateValue } from "@/lib/date-time"
import { requireCapability } from "@/lib/auth/require-capability"

export default async function StoreAssetsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>
}) {
  await requireCapability("store.read", "/store/assets")
  const rawQuery = (await searchParams).q
  const query = (Array.isArray(rawQuery) ? rawQuery[0] : rawQuery) ?? ""
  const repository = createStoreRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const assets = await (async () => {
    const organizationId = await repository.organizationIdForCode("MRMPL")
    return repository.listAssets({ organizationId, query })
  })().finally(() => repository.close())
  const today = istDateValue()

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Asset Master</h2>
        <p className="text-sm text-muted-foreground">
          One workspace per physical returnable asset, chair, light, tool or
          fixture.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Find Asset</CardTitle>
          <CardDescription>
            Search Asset Code, Type Code, identification name, item name or
            current holder.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex max-w-2xl gap-2">
            <Input
              defaultValue={query}
              name="q"
              placeholder="Example: N41-00001, chair, C501..."
              type="search"
            />
            <Button type="submit">Search</Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Physical Asset Register</CardTitle>
          <CardDescription>
            Open an Asset Code to see movement, maintenance, calibration, bill
            and guarantee history.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Asset Code</TableHead>
                <TableHead>Identification</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Current Assignment</TableHead>
                <TableHead>Next Maintenance</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assets.map((asset) => {
                const overdue =
                  asset.nextDueOn !== null && asset.nextDueOn <= today
                return (
                  <TableRow key={asset.id}>
                    <TableCell className="font-medium">
                      {asset.assetCode}
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
                        <Link
                          href={`/store/assets/${encodeURIComponent(asset.assetCode)}`}
                        >
                          Open
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
              {!assets.length ? (
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
    </div>
  )
}
