import { Search } from "lucide-react"
import Link from "next/link"

import { createProductPortfolioRepository } from "@workspace/db"
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
import { Label } from "@workspace/ui/components/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import { BoundedResultNotice } from "@/components/bounded-result-notice"
import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"

const portfolioPath = "/commercial/products"

export async function ProductPortfolioPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  await requireCapability("pricing.products.read", portfolioPath)
  const { q } = await searchParams
  const query = q?.trim() ?? ""
  const repository = createProductPortfolioRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const result = await repository
    .listForOrganization("MRMPL", query)
    .finally(() => repository.close())

  return (
    <div className="grid gap-6">
      <section>
        <h2 className="text-2xl font-semibold tracking-tight text-balance">
          Product Portfolio
        </h2>
        <p className="mt-1 text-sm text-pretty text-muted-foreground">
          Search Current Products Without Pricing Or Formula Details.
        </p>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Current Product Portfolio</CardTitle>
          <CardDescription>
            Read-Only Product Identity And Classification For Design Work.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <form
            aria-label="Search Product Portfolio"
            className="flex flex-col gap-2 sm:flex-row"
            role="search"
          >
            <Label className="sr-only" htmlFor="portfolio-query">
              Search Product Portfolio
            </Label>
            <Input
              autoComplete="off"
              className="min-w-0 sm:max-w-xl"
              defaultValue={query}
              id="portfolio-query"
              name="q"
              placeholder="Search UID, description, category, size…"
            />
            <Button type="submit">
              <Search aria-hidden="true" className="size-4" />
              Search
            </Button>
            {query ? (
              <Button asChild type="button" variant="ghost">
                <Link href={portfolioPath}>Clear Search</Link>
              </Button>
            ) : null}
          </form>

          <BoundedResultNotice
            actionHref="#portfolio-query"
            actionLabel="Refine Search"
            coverage={result.coverage}
            searchQuery={query}
            section="Product Portfolio"
          />

          <div className="max-h-[68svh] overflow-auto rounded-lg border">
            <Table
              className="min-w-[68rem]"
              containerClassName="max-h-none overflow-visible"
            >
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  <TableHead>Product UID</TableHead>
                  <TableHead>List / Package</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Subcategory</TableHead>
                  <TableHead>MRMPL Description</TableHead>
                  <TableHead>Product Type</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.rows.length ? (
                  result.rows.map((product) => (
                    <TableRow key={product.uid}>
                      <TableCell
                        className="font-mono font-medium"
                        translate="no"
                      >
                        {product.uid}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{product.itemType}</Badge>
                      </TableCell>
                      <TableCell>{product.size || "—"}</TableCell>
                      <TableCell>{product.category || "—"}</TableCell>
                      <TableCell>{product.subCategory || "—"}</TableCell>
                      <TableCell className="max-w-96 break-words whitespace-normal">
                        {product.mrmplDescription}
                      </TableCell>
                      <TableCell>{product.productType || "—"}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      className="h-32 text-center text-muted-foreground"
                      colSpan={7}
                    >
                      No Products Match This Search.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
