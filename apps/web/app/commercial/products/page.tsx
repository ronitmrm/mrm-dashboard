import Link from "next/link"
import { redirect } from "next/navigation"

import { createProductRepository } from "@workspace/db"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
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

import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"
import { money } from "@/lib/pricing/costing"
import { productPageBounds } from "@/lib/product-pagination"

export const dynamic = "force-dynamic"

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string | string[] }>
}) {
  await requireCapability("pricing.masters.read", "/commercial/products")
  const bounds = productPageBounds((await searchParams).page)

  const repository = createProductRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const products = await repository
    .listPageForOrganization("MRMPL", bounds)
    .finally(() => repository.close())
  if (!products.length && bounds.page > 1) {
    redirect("/commercial/products")
  }
  const totalCount = products[0]?.totalCount ?? 0
  const totalPages = Math.max(1, Math.ceil(totalCount / bounds.limit))

  return (
    <Card>
      <CardHeader>
        <CardTitle>Products</CardTitle>
        <CardDescription>
          Canonical product identities and Pricing calculation inputs. Exact
          source aliases remain separate from item identity.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
          <span>
            Showing {products.length ? bounds.offset + 1 : 0}–
            {Math.min(bounds.offset + products.length, totalCount)} of{" "}
            {totalCount} products
          </span>
          <div className="flex items-center gap-2">
            {bounds.page > 1 ? (
              <Button asChild size="sm" variant="outline">
                <Link href={`/commercial/products?page=${bounds.page - 1}`}>
                  Previous
                </Link>
              </Button>
            ) : (
              <Button disabled size="sm" variant="outline">
                Previous
              </Button>
            )}
            <span>
              Page {Math.min(bounds.page, totalPages)} of {totalPages}
            </span>
            {bounds.page < totalPages ? (
              <Button asChild size="sm" variant="outline">
                <Link href={`/commercial/products?page=${bounds.page + 1}`}>
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
        <div className="overflow-hidden rounded-3xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product UID</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Production</TableHead>
                <TableHead className="text-right">Pieces / kg</TableHead>
                <TableHead className="text-right">Product cost</TableHead>
                <TableHead>Source</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.length ? (
                products.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell className="font-medium">{product.uid}</TableCell>
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
                    No products have been loaded into PostgreSQL yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
