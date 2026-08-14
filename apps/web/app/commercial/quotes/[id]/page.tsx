import Link from "next/link"
import { notFound } from "next/navigation"

import { createCommercialCostingRepository } from "@workspace/db"
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

import { sendQuoteAction } from "@/app/commercial/costing/actions"
import { readAuthEnvironment } from "@/lib/auth/auth"
import { commercialCapabilities } from "@/lib/auth/commercial-capabilities"
import { requireCapability } from "@/lib/auth/require-capability"

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 4,
    minimumFractionDigits: 2,
  }).format(value)
}

export default async function QuoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  await requireCapability(
    commercialCapabilities.quotes.read,
    `/commercial/quotes/${id}`
  )

  const repository = createCommercialCostingRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const quote = await repository
    .getQuote(id)
    .catch(() => null)
    .finally(() => repository.close())
  if (!quote) {
    notFound()
  }

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="mb-2 flex flex-wrap gap-2">
                <Badge
                  variant={quote.status === "Sent" ? "default" : "secondary"}
                >
                  {quote.status}
                </Badge>
                {quote.isActive ? (
                  <Badge variant="outline">Active Price</Badge>
                ) : null}
              </div>
              <CardTitle>{quote.quoteNumber}</CardTitle>
              <CardDescription>
                {quote.companyName} · {quote.uid} · Revision {quote.revision}
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline">
                <Link href="/commercial/quotes">Quote Register</Link>
              </Button>
              {quote.status === "Draft" ? (
                <form action={sendQuoteAction}>
                  <input name="quote_item_id" type="hidden" value={quote.id} />
                  <Button type="submit">Mark Sent</Button>
                </form>
              ) : null}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <MetricCard
              label="Rate Before Rejection"
              value={`₹ ${money(quote.rateInr)}`}
            />
            <MetricCard
              label="Total Inr"
              value={`₹ ${money(quote.totalRateInr)}`}
            />
            <MetricCard
              label="Approved Usd / Pc"
              value={`$ ${money(quote.approvedPriceUsd)}`}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Immediate Component Snapshot</CardTitle>
          <CardDescription>
            Nested Packages Point To Their Own Child Quote Snapshots, Preserving
            The Original Hierarchy.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-3xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Component</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead className="text-right">Unit Inr</TableHead>
                  <TableHead className="text-right">Extended Inr</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {quote.components.length ? (
                  quote.components.map((component) => (
                    <TableRow
                      key={`${component.componentUid}:${component.childQuoteItemId}`}
                    >
                      <TableCell className="font-medium">
                        {component.childQuoteItemId ? (
                          <Link
                            className="underline-offset-4 hover:underline"
                            href={`/commercial/quotes/${component.childQuoteItemId}`}
                          >
                            {component.componentUid}
                          </Link>
                        ) : (
                          component.componentUid
                        )}
                      </TableCell>
                      <TableCell>{component.description || "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {money(component.quantity)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        ₹ {money(component.unitCost)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        ₹ {money(component.extendedCost)}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      className="h-24 text-center text-muted-foreground"
                      colSpan={5}
                    >
                      This Is A Leaf-Product Quote.
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
