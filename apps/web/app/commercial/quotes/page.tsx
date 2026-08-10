import Link from "next/link"

import { createCommercialCostingRepository } from "@workspace/db"
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

export default async function QuotesPage() {
  await requireCapability(
    commercialCapabilities.quotes.read,
    "/commercial/quotes"
  )

  const repository = createCommercialCostingRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const quotes = await repository
    .listQuotes("MRMPL")
    .finally(() => repository.close())

  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <CardTitle>Quote Register</CardTitle>
            <CardDescription>
              Draft, Active, And Superseded Quote Revisions. Sent Values Are
              Immutable And Remain Available As Historical Evidence.
            </CardDescription>
          </div>
          <Button asChild variant="outline">
            <Link href="/commercial/costing">Return To Costing</Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-hidden rounded-3xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quote</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Revision</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Usd / Pc</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {quotes.length ? (
                quotes.map((quote) => (
                  <TableRow key={quote.id}>
                    <TableCell className="font-medium">
                      <Link
                        className="underline-offset-4 hover:underline"
                        href={`/commercial/quotes/${quote.id}`}
                      >
                        {quote.quoteNumber}
                      </Link>
                    </TableCell>
                    <TableCell>{quote.companyName}</TableCell>
                    <TableCell>{quote.uid}</TableCell>
                    <TableCell>R{quote.revision}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        <Badge
                          variant={
                            quote.status === "Sent" ? "default" : "secondary"
                          }
                        >
                          {quote.status}
                        </Badge>
                        {quote.isActive ? (
                          <Badge variant="outline">Active Price</Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      $ {money(quote.rateUsd)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {quote.enquiryId ? (
                          <Button asChild size="sm" variant="outline">
                            <Link
                              href={
                                "/commercial/quotes/enquiry/" +
                                quote.enquiryId +
                                "/pdf"
                              }
                            >
                              Pdf
                            </Link>
                          </Button>
                        ) : null}
                        {quote.status === "Draft" ? (
                          <form action={sendQuoteAction}>
                            <input
                              name="quote_item_id"
                              type="hidden"
                              value={quote.id}
                            />
                            <Button size="sm" type="submit">
                              Mark Sent
                            </Button>
                          </form>
                        ) : (
                          <Button asChild size="sm" variant="ghost">
                            <Link href={`/commercial/quotes/${quote.id}`}>
                              View
                            </Link>
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    className="h-32 text-center text-muted-foreground"
                    colSpan={7}
                  >
                    No Quotes Have Been Saved Yet.
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
