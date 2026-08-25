import Link from "next/link"
import { redirect } from "next/navigation"

import { createProductRepository } from "@workspace/db"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import { FullPageWorkspace } from "@/components/full-page-workspace"
import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"
import { money } from "@/lib/pricing/costing"
import { pageBounds } from "@/lib/page-bounds"

export const dynamic = "force-dynamic"

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string | string[]
  }>
}) {
  await requireCapability("pricing.products.read", "/commercial/products")
  const params = await searchParams
  const bounds = pageBounds(params.page, 25)

  const repository = createProductRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const productPage = await repository
    .listPageForOrganization("MRMPL", bounds)
    .finally(() => repository.close())
  const products = productPage.rows
  if (!products.length && bounds.page > 1) {
    redirect("/commercial/products")
  }
  const totalCount = productPage.coverage.total ?? 0
  const totalPages = Math.max(1, Math.ceil(totalCount / bounds.limit))

  return (
    <FullPageWorkspace className="grid-rows-[minmax(0,1fr)]">
      <Card className="min-h-0">
        <CardHeader>
          <CardTitle>Products</CardTitle>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
            <span>
              Showing {products.length ? bounds.offset + 1 : 0}–
              {Math.min(bounds.offset + products.length, totalCount)} Of{" "}
              {totalCount} Products
            </span>
            <div className="flex items-center gap-2">
              {bounds.page > 1 ? (
                <Button asChild size="sm" variant="outline">
                  <Link
                    href={{
                      pathname: "/commercial/products",
                      query: { page: bounds.page - 1 },
                    }}
                  >
                    Previous
                  </Link>
                </Button>
              ) : (
                <Button disabled size="sm" variant="outline">
                  Previous
                </Button>
              )}
              <span>
                Page {Math.min(bounds.page, totalPages)} Of {totalPages}
              </span>
              {bounds.page < totalPages ? (
                <Button asChild size="sm" variant="outline">
                  <Link
                    href={{
                      pathname: "/commercial/products",
                      query: { page: bounds.page + 1 },
                    }}
                  >
                    Next
                  </Link>
                </Button>
              ) : (
                <Button disabled size="sm" variant="outline">
                  Next
                </Button>
              )}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden rounded-3xl border [&_[data-slot=table-container]]:max-h-none [&_[data-slot=table-container]]:min-h-0 [&_[data-slot=table-container]]:flex-1 [&_[data-slot=table-shell]]:flex [&_[data-slot=table-shell]]:h-full [&_[data-slot=table-shell]]:min-h-0 [&_[data-slot=table-shell]]:flex-col">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product Uid</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Production</TableHead>
                  <TableHead className="text-right">Pieces / Kg</TableHead>
                  <TableHead className="text-right">Product Cost</TableHead>
                  <TableHead>Source</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.length ? (
                  products.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell className="font-medium">
                        {product.uid}
                      </TableCell>
                      <TableCell>{product.description}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{product.itemType}</Badge>
                      </TableCell>
                      <TableCell>{product.productionType || "—"}</TableCell>
                      <TableCell className="text-right">
                        {money(Number(product.piecesPerKg), 4)}
                      </TableCell>
                      <TableCell className="text-right">
                        ₹ {money(Number(product.productCostInr), 4)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {product.sourceTable}:{product.sourceId}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      className="h-32 text-center text-muted-foreground"
                      colSpan={7}
                    >
                      No Products Have Been Loaded Into Postgresql Yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </FullPageWorkspace>
  )
}
