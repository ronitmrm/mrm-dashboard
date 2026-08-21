import Link from "next/link"
import { notFound, redirect } from "next/navigation"

import { createCommercialWorkflowRepository } from "@workspace/db"
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

import { BoundedResultNotice } from "@/components/bounded-result-notice"
import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"

import {
  selectDesignPortfolioProductAction,
  startDesignWorkAction,
} from "../../enquiries/actions"

export const dynamic = "force-dynamic"

function display(value: number | string | null | undefined) {
  return value === null || value === undefined || value === "" ? "—" : value
}

export default async function DesignPortfolioReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ q?: string | string[] }>
}) {
  const { id } = await params
  await requireCapability("pricing.design.read", `/commercial/design/${id}`)
  const queryValue = (await searchParams).q
  const query = typeof queryValue === "string" ? queryValue.trim() : ""
  const workflow = createCommercialWorkflowRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const data = await (async () => {
    try {
      const selectedItem = await workflow.getDesignTask("MRMPL", id)
      if (!selectedItem) return null
      const productOptions = query
        ? await workflow.searchDesignPortfolioProducts("MRMPL", query)
        : {
            coverage: { limit: 50, returned: 0, truncated: false },
            rows: [],
          }
      return { productOptions, selectedItem }
    } finally {
      await workflow.close()
    }
  })()
  if (!data) notFound()
  if (data.selectedItem.portfolioMatchStatus === "New Quoted Part") {
    redirect(`/commercial/design/${id}/new`)
  }
  if (data.selectedItem.portfolioMatchStatus === "Matches Existing Portfolio") {
    redirect("/commercial/design")
  }
  const { productOptions, selectedItem } = data

  return (
    <div className="grid gap-6">
      <section className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-2">
          <Button asChild className="w-fit" size="sm" variant="ghost">
            <Link href="/commercial/design">Back To Design Queue</Link>
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-semibold tracking-tight">
              Check Current Portfolio
            </h2>
            <Badge variant="secondary">{selectedItem.designStatus}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {selectedItem.enquiryNumber} / Line {selectedItem.lineNumber} ·{" "}
            {display(selectedItem.customerPartCode)} ·{" "}
            {selectedItem.description}
          </p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href={`/commercial/enquiries/${selectedItem.enquiryId}`}>
            Open Enquiry
          </Link>
        </Button>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Search Before Starting Design</CardTitle>
          <CardDescription>
            Search by Product UID or description. Select a matching product, or
            confirm that a new product must be designed.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          <form
            className="flex flex-col gap-2 sm:flex-row"
            id="portfolio-search"
            role="search"
          >
            <Input
              aria-label="Search current portfolio by Product UID or description"
              className="max-w-xl"
              defaultValue={query}
              name="q"
              placeholder="Product UID or description"
              required
            />
            <Button type="submit">Search Current Portfolio</Button>
            {query ? (
              <Button asChild type="button" variant="outline">
                <Link href={`/commercial/design/${id}`}>Clear</Link>
              </Button>
            ) : null}
          </form>

          {query ? (
            <>
              <BoundedResultNotice
                actionHref="#portfolio-search"
                actionLabel="Refine product search"
                coverage={productOptions.coverage}
                searchQuery={query}
                section="Current Portfolio"
              />
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product UID</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {productOptions.rows.length ? (
                      productOptions.rows.map((product) => (
                        <TableRow key={product.id}>
                          <TableCell className="font-medium">
                            {product.uid}
                          </TableCell>
                          <TableCell>{product.description}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{product.itemType}</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <form action={selectDesignPortfolioProductAction}>
                              <input
                                name="enquiry_id"
                                type="hidden"
                                value={selectedItem.enquiryId}
                              />
                              <input
                                name="enquiry_item_id"
                                type="hidden"
                                value={selectedItem.enquiryItemId}
                              />
                              <input
                                name="matched_product_id"
                                type="hidden"
                                value={product.id}
                              />
                              <Button size="sm" type="submit">
                                Use Product
                              </Button>
                            </form>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell
                          className="h-28 text-center text-muted-foreground"
                          colSpan={4}
                        >
                          No portfolio products match “{query}”.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-muted/30 p-4">
                <p className="text-sm text-muted-foreground">
                  Reviewed the results and found no matching product?
                </p>
                <form action={startDesignWorkAction}>
                  <input
                    name="enquiry_item_id"
                    type="hidden"
                    value={selectedItem.enquiryItemId}
                  />
                  <Button type="submit" variant="outline">
                    Create New Product
                  </Button>
                </form>
              </div>
            </>
          ) : (
            <p className="rounded-2xl border bg-muted/30 p-4 text-sm text-muted-foreground">
              Enter a Product UID or description to review the current portfolio
              before deciding.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
