import Link from "next/link"

import { createCommercialRevisionsRepository } from "@workspace/db"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  MetricCard,
} from "@workspace/ui/components/card"
import { Field, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { Textarea } from "@workspace/ui/components/textarea"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { commercialCapabilities } from "@/lib/auth/commercial-capabilities"
import { requireCapability } from "@/lib/auth/require-capability"

import { createBulkPriceRevisionAction } from "../revisions/actions"

export const dynamic = "force-dynamic"

function localDate() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, "0")
  const day = String(now.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export default async function ProductBulkRevisionPage() {
  await requireCapability(
    commercialCapabilities.revisions.read,
    "/commercial/product-bulk-revision"
  )
  const repository = createCommercialRevisionsRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const summary = await (async () => {
    try {
      return await repository.getProductBulkRevisionSummary("MRMPL")
    } finally {
      await repository.close()
    }
  })()

  return (
    <div className="grid gap-6">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Product Parameter Bulk Revision
          </h1>
          <p className="text-sm text-muted-foreground">
            Start a revision here. Product selection and costing are completed
            from Product Parameter Costing.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/commercial/product-costing">Product Costing Queue</Link>
        </Button>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <MetricCard
          label="Product Revision Requests"
          value={summary.openRevisionCount}
        />
        <MetricCard
          label="Product Changes Staged"
          value={summary.stagedChangeCount}
        />
        <MetricCard
          label="Customer Prices Affected"
          value={summary.activePriceCount}
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Start A Product Revision</CardTitle>
          <CardDescription>
            Record why one or more product cost parameters need revision. Each
            product code is selected once in Product Parameter Costing.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {summary.organizationId ? (
            <form
              action={createBulkPriceRevisionAction}
              className="grid gap-4 md:grid-cols-[16rem_1fr_auto] md:items-end"
            >
              <input
                name="organization_id"
                type="hidden"
                value={summary.organizationId}
              />
              <input
                name="revision_route"
                type="hidden"
                value="Product Parameter Bulk Revision"
              />
              <Field>
                <FieldLabel htmlFor="product-revision-effective">
                  Effective Date
                </FieldLabel>
                <Input
                  defaultValue={localDate()}
                  id="product-revision-effective"
                  name="effective_on"
                  required
                  type="date"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="product-revision-reason">
                  Reason
                </FieldLabel>
                <Textarea
                  className="min-h-10"
                  id="product-revision-reason"
                  name="reason"
                  required
                  rows={1}
                />
              </Field>
              <Button type="submit">Send To Product Costing</Button>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">
              The MRMPL organization must be loaded first.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
