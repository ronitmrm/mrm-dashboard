import Link from "next/link"

import { createCommercialRevisionsRepository } from "@workspace/db"
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
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { commercialCapabilities } from "@/lib/auth/commercial-capabilities"
import { requireCapability } from "@/lib/auth/require-capability"

import {
  applyProductBulkRevisionPriceDecisionAction,
  completeBulkPriceRevisionAction,
} from "../../../revisions/actions"

export const dynamic = "force-dynamic"

const numberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 4,
  minimumFractionDigits: 2,
})
const money = (value: number) => numberFormatter.format(value)
const percent = (value: number) => `${money(value * 100)}%`
const bulkRevisionTableLimit = 10_000

function validUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  )
}

export default async function ProductRevisionCustomerCostingPage({
  params,
}: {
  params: Promise<{ revisionId: string }>
}) {
  await requireCapability(
    commercialCapabilities.costing.read,
    "/commercial/customer-costing"
  )
  const { revisionId: rawRevisionId } = await params
  const revisionId = validUuid(rawRevisionId) ? rawRevisionId : ""
  const repository = createCommercialRevisionsRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const work = await (async () => {
    try {
      return revisionId
        ? await repository.getProductBulkRevisionCustomerCosting(revisionId, {
            limit: bulkRevisionTableLimit,
          })
        : null
    } finally {
      await repository.close()
    }
  })()

  if (!work) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Product Revision Customer Costing Not Available</CardTitle>
          <CardDescription>
            This revision is not waiting for Customer Parameter Costing.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href="/commercial/customer-costing">
              Back To Customer Costing
            </Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  const allPricesDecided = work.decidedPriceCount === work.affectedPriceCount

  return (
    <div className="grid gap-4">
      <div className="flex justify-end">
        <Button asChild variant="outline">
          <Link href="/commercial/customer-costing">
            Back To Customer Costing
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>Affected Customer Prices</CardTitle>
            </div>
            <Badge variant="outline">
              {work.decidedPriceCount} / {work.affectedPriceCount} Decided
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-6">
          <div className="h-[calc(100svh-18rem)] min-h-[34rem] overflow-auto rounded-md border">
            <Table excelFilters>
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Customer Part</TableHead>
                  <TableHead>UID</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Subcategory</TableHead>
                  <TableHead>Current</TableHead>
                  <TableHead>Revise Price</TableHead>
                  <TableHead>Keep Price Same</TableHead>
                  <TableHead>Decision</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {work.rows.map((price) => (
                  <TableRow key={price.quoteItemId}>
                    <TableCell>{price.companyName}</TableCell>
                    <TableCell className="font-mono">
                      {price.customerPartCode ?? "—"}
                    </TableCell>
                    <TableCell className="font-mono whitespace-nowrap">
                      {price.uid}
                    </TableCell>
                    <TableCell className="min-w-64">
                      {price.description}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {price.category ?? "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {price.subcategory ?? "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      <span>$ {money(price.approvedPriceUsd)}</span>
                      <span className="block text-xs text-muted-foreground">
                        Profit {percent(price.currentProfitPercent)}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      <span>$ {money(price.revisePriceUsd)}</span>
                      <span className="block text-xs text-muted-foreground">
                        Profit {percent(price.reviseProfitPercent)}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      <span>$ {money(price.keepSamePriceUsd)}</span>
                      <span className="block text-xs text-muted-foreground">
                        Profit {percent(price.keepSameProfitPercent)}
                      </span>
                    </TableCell>
                    <TableCell>
                      {price.decision ? (
                        <Badge>{price.decision}</Badge>
                      ) : (
                        <form
                          action={applyProductBulkRevisionPriceDecisionAction}
                          className="flex min-w-72 gap-2"
                        >
                          <input
                            name="bulk_price_revision_id"
                            type="hidden"
                            value={work.revision.id}
                          />
                          <input
                            name="source_quote_item_id"
                            type="hidden"
                            value={price.quoteItemId}
                          />
                          <NativeSelect name="decision" required>
                            <NativeSelectOption value="Revise Price">
                              Revise Price
                            </NativeSelectOption>
                            <NativeSelectOption value="Keep Price Same">
                              Keep Price Same
                            </NativeSelectOption>
                          </NativeSelect>
                          <Input name="notes" placeholder="Note" />
                          <Button type="submit">Record</Button>
                        </form>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {!work.rows.length ? (
                  <TableRow>
                    <TableCell className="h-24 text-center" colSpan={10}>
                      No Affected Prices Are In Scope.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              Product Master and the Pricing Register publish only after every
              affected price has a decision and this revision completes.
            </p>
            <form action={completeBulkPriceRevisionAction}>
              <input
                name="bulk_price_revision_id"
                type="hidden"
                value={work.revision.id}
              />
              <input
                name="return_to_customer_costing"
                type="hidden"
                value="true"
              />
              <Button disabled={!allPricesDecided} type="submit">
                Complete And Publish Revision
              </Button>
            </form>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
