import Link from "next/link"
import { redirect } from "next/navigation"
import { createCommercialRevisionsRepository } from "@workspace/db"
import { Button } from "@workspace/ui/components/button"
import {
  SectionCard,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  MetricCard,
} from "@workspace/ui/components/card"
import { Field, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import { Textarea } from "@workspace/ui/components/textarea"
import { PageHeader } from "@/components/ui/golden-patterns"
import { readAuthEnvironment } from "@/lib/auth/auth"
import { commercialCapabilities } from "@/lib/auth/commercial-capabilities"
import { requireCapability } from "@/lib/auth/require-capability"
import { createBulkPriceRevisionAction } from "../revisions/actions"
import { BulkRevisionRequestStatus } from "../revisions/bulk-revision-request-status"
export const dynamic = "force-dynamic"
function localDate() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, "0")
  const day = String(now.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export default async function CustomerBulkRevisionPage({
  searchParams,
}: {
  searchParams: Promise<{ revision?: string }>
}) {
  await requireCapability(
    commercialCapabilities.revisions.read,
    "/commercial/customer-bulk-revision"
  )
  const params = await searchParams
  if (params.revision?.trim())
    redirect(
      `/commercial/customer-costing/customer-revisions/${encodeURIComponent(params.revision.trim())}`
    )
  const repository = createCommercialRevisionsRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const { summary, reference } = await (async () => {
    try {
      const [summary, reference] = await Promise.all([
        repository.getCustomerBulkRevisionSummary("MRMPL"),
        repository.listCustomerBulkRevisionReferenceData("MRMPL"),
      ])
      return { summary, reference }
    } finally {
      await repository.close()
    }
  })()
  return (
    <div className="grid gap-6">
      <PageHeader
        title="Customer Parameter Bulk Revision"
        actions={
          <Button asChild variant="outline">
            <Link href="/commercial/customer-costing">
              Customer Parameter Costing
            </Link>
          </Button>
        }
      />
      <section className="grid gap-3 sm:grid-cols-3">
        <MetricCard
          tone="information"
          label="Customer Revision Requests"
          value={summary.openRevisionCount}
        />
        <MetricCard
          tone="accent"
          label="Commercial-Only Revision"
          value={summary.commercialOnlyRevision}
        />
        <MetricCard
          tone="brand"
          label="Customer Prices In Scope"
          value={summary.activePriceCount}
        />
      </section>

      <div className="grid gap-6">
        <SectionCard>
          <CardHeader>
            <CardTitle>Start A Customer Revision</CardTitle>
            <CardDescription>
              Select all customers or one customer with an active quote or
              price.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {reference.organizationId ? (
              <form
                action={createBulkPriceRevisionAction}
                className="grid gap-4 md:grid-cols-[minmax(16rem,1.3fr)_14rem_minmax(18rem,2fr)_auto] md:items-end"
              >
                <input
                  name="organization_id"
                  type="hidden"
                  value={reference.organizationId}
                />
                <input
                  name="revision_route"
                  type="hidden"
                  value="Customer Parameter Bulk Revision"
                />
                <Field>
                  <FieldLabel htmlFor="customer-revision-customer">
                    Customer
                  </FieldLabel>
                  <NativeSelect
                    id="customer-revision-customer"
                    name="customer_id"
                    required
                  >
                    <NativeSelectOption value="">
                      Select Customer With Active Price
                    </NativeSelectOption>
                    <NativeSelectOption
                      value="all"
                      disabled={!reference.rows.length}
                    >
                      All Customers
                    </NativeSelectOption>
                    {reference.rows.map((customer) => (
                      <NativeSelectOption key={customer.id} value={customer.id}>
                        {customer.customerUid} · {customer.companyName}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
                <Field>
                  <FieldLabel htmlFor="customer-revision-effective">
                    Effective Date
                  </FieldLabel>
                  <Input
                    defaultValue={localDate()}
                    id="customer-revision-effective"
                    name="effective_on"
                    required
                    type="date"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="customer-revision-reason">
                    Reason
                  </FieldLabel>
                  <Textarea
                    className="min-h-10"
                    id="customer-revision-reason"
                    name="reason"
                    required
                    rows={1}
                  />
                </Field>
                <Button type="submit">Send To Costing</Button>
              </form>
            ) : (
              <p className="text-sm text-muted-foreground">
                The Mrmpl Organization Must Be Loaded First.
              </p>
            )}
          </CardContent>
        </SectionCard>
      </div>
      <BulkRevisionRequestStatus origin="customer" />
    </div>
  )
}
