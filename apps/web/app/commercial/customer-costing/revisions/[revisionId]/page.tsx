import Link from "next/link"
import { formatCustomerParameter } from "../../../revisions/customer-parameter-columns"
import { CustomerCostingPriceTable } from "./customer-costing-price-table"

import {
  createCommercialRevisionsRepository,
  customerRevisionParameterColumns,
} from "@workspace/db"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  SectionCard,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { readAuthEnvironment } from "@/lib/auth/auth"
import { commercialCapabilities } from "@/lib/auth/commercial-capabilities"
import { requireCapability } from "@/lib/auth/require-capability"

import { PublishRevisionForm } from "./publish-revision-form"

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
      <SectionCard>
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
      </SectionCard>
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

      <SectionCard>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>Affected Customer Prices</CardTitle>
              <CardDescription>
                Scroll horizontally for current product and customer costing
                parameters. Saved quote inputs take precedence over Product
                master values; Revise Price and Keep Price Same show the
                proposed outcomes.
              </CardDescription>
            </div>
            <Badge variant="outline">
              {work.decidedPriceCount} / {work.affectedPriceCount} Decided
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-6">
          <CustomerCostingPriceTable
            revisionId={work.revision.id}
            storageKey={`customer-costing-revision:${work.revision.id}`}
            columns={[
              "Customer",
              "Customer Part",
              "UID",
              "Description",
              "Category",
              "Subcategory",
              "Current",
              "Revise Price",
              "Keep Price Same",
              "Decision",
              ...customerRevisionParameterColumns.map((column) => column.label),
            ]}
            rows={work.rows.map((price) => ({
              ...price,
              values: [
                price.companyName,
                price.customerPartCode ?? "�",
                price.uid,
                price.description,
                price.category ?? "�",
                price.subcategory ?? "�",
                `$ ${money(price.approvedPriceUsd)} Profit ${percent(price.currentProfitPercent)}`,
                `$ ${money(price.revisePriceUsd)} Profit ${percent(price.reviseProfitPercent)}`,
                `$ ${money(price.keepSamePriceUsd)} Profit ${percent(price.keepSameProfitPercent)}`,
                price.decision ?? "Pending",
                ...customerRevisionParameterColumns.map((column) =>
                  formatCustomerParameter(
                    price.parameters[column.label],
                    column.format
                  )
                ),
              ],
            }))}
          />

          <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              Product Master and the Pricing Register publish only after every
              affected price has a decision and this revision completes.
            </p>
            <PublishRevisionForm
              revisionId={work.revision.id}
              disabled={!allPricesDecided}
            />
          </div>
        </CardContent>
      </SectionCard>
    </div>
  )
}
