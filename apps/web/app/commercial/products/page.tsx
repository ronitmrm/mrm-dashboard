import { createProductRepository } from "@workspace/db"
import { Badge } from "@workspace/ui/components/badge"
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

export const dynamic = "force-dynamic"

export default async function ProductsPage() {
  await requireCapability("pricing.masters.read", "/commercial/products")

  const repository = createProductRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const products = await repository
    .listForOrganization("MRMPL")
    .finally(() => repository.close())

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
