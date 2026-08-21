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
import { Input } from "@workspace/ui/components/input"
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
import { istDateValue } from "@/lib/date-time"

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
  const today = istDateValue()

  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <CardTitle>Quote Register</CardTitle>
            <CardDescription>
              In-Progress, Ready, Active, And Superseded Quote Revisions. Sent
              Values Are Immutable And Remain Available As Historical Evidence.
            </CardDescription>
          </div>
          <Button asChild variant="outline">
            <Link href="/commercial/customer-costing">Return To Costing</Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-hidden rounded-3xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead data-filterable="true">Quote</TableHead>
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
                        {quote.status === "Ready" ? (
                          <form
                            action={sendQuoteAction}
                            className="flex flex-wrap items-end justify-end gap-2"
                          >
                            <input
                              name="quote_item_id"
                              type="hidden"
                              value={quote.id}
                            />
                            <label className="grid gap-1 text-left text-xs font-medium">
                              Follow-Up Date
                              <Input
                                aria-label={`Follow-Up Date For ${quote.quoteNumber}`}
                                className="h-8 w-36"
                                min={today}
                                name="followup_due_on"
                                required
                                type="date"
                              />
                            </label>
                            <Button size="sm" type="submit">
                              Send Quote
                            </Button>
                          </form>
                        ) : quote.status === "Draft" && quote.enquiryItemId ? (
                          <Button asChild size="sm" variant="outline">
                            <Link
                              href={`/commercial/customer-costing?task=${encodeURIComponent(quote.enquiryItemId)}#customer-cost-form`}
                            >
                              Continue Costing
                            </Link>
                          </Button>
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
