import Link from "next/link"

import {
  bulkRevisionFields,
  createCommercialRevisionsRepository,
} from "@workspace/db"
import { Badge } from "@workspace/ui/components/badge"
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
import {
 OperationalTable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { Textarea } from "@workspace/ui/components/textarea"

import { BoundedResultNotice } from "@/components/bounded-result-notice"
import { readAuthEnvironment } from "@/lib/auth/auth"
import { commercialCapabilities } from "@/lib/auth/commercial-capabilities"
import { requireCapability } from "@/lib/auth/require-capability"

import {
  completeBulkPriceRevisionAction,
  createBulkPriceRevisionAction,
  deleteBulkPriceRevisionStageAction,
  stageBulkPriceRevisionAction,
} from "../revisions/actions"

export const dynamic = "force-dynamic"

const customerFields = Object.entries(bulkRevisionFields).filter(
  ([, field]) => field.route === "customer"
)
const productFieldNames = new Set(
  Object.entries(bulkRevisionFields)
    .filter(([, field]) => field.route === "product")
    .map(([fieldName]) => fieldName)
)

const activePriceHeadings = [
  "Select",
  "Customer",
  "Customer Part",
  "UID",
  "Description",
  "Category",
  "Subcategory",
  "Current Price",
  "Scrap",
  "Packing",
  "Shipping",
  "OR",
  "Profit",
  "FX",
] as const
const bulkRevisionTableLimit = 10_000

const numberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 4,
  minimumFractionDigits: 2,
})

const money = (value: number) => numberFormatter.format(value)

const percent = (value: number) => `${money(value * 100)}%`

function localDate() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, "0")
  const day = String(now.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function validUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  )
}

export default async function CustomerBulkRevisionPage({
  searchParams,
}: {
  searchParams: Promise<{
    revision?: string
  }>
}) {
  await requireCapability(
    commercialCapabilities.revisions.read,
    "/commercial/customer-bulk-revision"
  )
  const params = await searchParams
  const selectedRevisionId = validUuid(params.revision?.trim() ?? "")
    ? params.revision!.trim()
    : ""
  const repository = createCommercialRevisionsRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const data = await (async () => {
    try {
      const [queue, summary, reference, selectedRevision, stages, prices] =
        await Promise.all([
          repository.listCustomerBulkPriceRevisionsBounded("MRMPL"),
          repository.getCustomerBulkRevisionSummary("MRMPL"),
          repository.listCustomerBulkRevisionReferenceData("MRMPL"),
          selectedRevisionId
            ? repository.getCustomerBulkPriceRevision(
                "MRMPL",
                selectedRevisionId
              )
            : Promise.resolve(null),
          selectedRevisionId
            ? repository.listBulkPriceRevisionStages(selectedRevisionId)
            : Promise.resolve([]),
          selectedRevisionId
            ? repository.listBulkPriceRevisionActivePricesBounded(
                selectedRevisionId,
                { limit: bulkRevisionTableLimit }
              )
            : Promise.resolve({
                coverage: {
                  limit: bulkRevisionTableLimit,
                  returned: 0,
                  total: 0,
                  truncated: false,
                },
                rows: [],
              }),
        ])
      return { prices, queue, reference, selectedRevision, stages, summary }
    } finally {
      await repository.close()
    }
  })()
  const { prices, queue, reference, selectedRevision, stages, summary } = data
  const isCompleted = selectedRevision?.status === "Completed"

  return (
    <div className="grid gap-6">
      <section className="grid gap-2">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Customer Parameter Bulk Revision
            </h1>
          </div>
          <Button asChild variant="outline">
            <Link href="/commercial/revisions">All Price Revisions</Link>
          </Button>
        </div>
        <BoundedResultNotice
          coverage={queue.coverage}
          section="Customer bulk revision queue"
        />
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <MetricCard tone="information"
          label="Customer Revision Requests"
          value={summary.openRevisionCount}
        />
        <MetricCard tone="accent"
          label="Commercial-Only Revision"
          value={summary.commercialOnlyRevision}
        />
        <MetricCard tone="brand"
          label="Customer Prices In Scope"
          value={summary.activePriceCount}
        />
      </section>

      <div className="grid gap-6">
 <SectionCard>
          <CardHeader>
            <CardTitle>Start A Customer Revision</CardTitle>
            <CardDescription>
              Select one customer that has an active quote or price.
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

 <SectionCard>
          <CardHeader>
            <CardTitle>Customer Revision Queue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-[34rem] overflow-auto rounded-md border">
 <OperationalTable excelFilters>
                <TableHeader className="sticky top-0 z-10 bg-background">
                  <TableRow>
                    <TableHead data-filterable="true">Request</TableHead>
                    <TableHead data-filterable="true">Customer</TableHead>
                    <TableHead data-filterable="true">Route</TableHead>
                    <TableHead>Active Prices</TableHead>
                    <TableHead>Staged</TableHead>
                    <TableHead data-filterable="true">Status</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {queue.rows.map((revision) => (
                    <TableRow
                      className="[contain-intrinsic-size:auto_48px] [content-visibility:auto]"
                      key={revision.id}
                    >
                      <TableCell className="font-mono">
                        {revision.revisionNumber}
                      </TableCell>
                      <TableCell>
                        {revision.companyName ?? "All Customers"}
                      </TableCell>
                      <TableCell>{revision.revisionRoute}</TableCell>
                      <TableCell className="tabular-nums">
                        {revision.activePriceCount}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {revision.changeCount}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{revision.status}</Badge>
                      </TableCell>
                      <TableCell>
                        <Button asChild size="sm" variant="outline">
                          <Link
                            href={`/commercial/customer-bulk-revision?revision=${encodeURIComponent(revision.id)}#customer-bulk-workbench`}
                          >
                            Open Revision
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!queue.rows.length ? (
                    <TableRow>
                      <TableCell className="h-24 text-center" colSpan={7}>
                        No Customer Parameter Bulk Revisions Are Pending.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
 </OperationalTable>
            </div>
          </CardContent>
 </SectionCard>
      </div>

 <SectionCard hidden={!selectedRevisionId} id="customer-bulk-workbench">
        <CardHeader>
          <CardTitle>Customer Revision Workbench</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-6">
          {selectedRevision ? (
            <>
              <div className="flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="mb-2 flex flex-wrap gap-2">
                    <Badge variant={isCompleted ? "default" : "secondary"}>
                      {selectedRevision.status}
                    </Badge>
                    <Badge variant="outline">
                      {selectedRevision.revisionRoute}
                    </Badge>
                  </div>
                  <p className="font-mono font-semibold">
                    {selectedRevision.revisionNumber}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {selectedRevision.companyName ?? "All Customers"} ·
                    Effective {selectedRevision.effectiveOn}
                  </p>
                  <p className="mt-2 text-sm whitespace-pre-wrap">
                    {selectedRevision.reason}
                  </p>
                </div>
                <Button asChild size="sm" variant="ghost">
                  <Link href="/commercial/customer-bulk-revision#customer-bulk-workbench">
                    Close Workbench
                  </Link>
                </Button>
              </div>

              <p className="text-right text-xs text-muted-foreground tabular-nums">
                {selectedRevision.activePriceCount} Active Prices In Scope
              </p>

              {!isCompleted ? (
                <form
                  action={stageBulkPriceRevisionAction}
                  className="grid gap-4"
                >
                  <input
                    name="bulk_price_revision_id"
                    type="hidden"
                    value={selectedRevision.id}
                  />
 <OperationalTable
                    className="w-full caption-bottom text-sm"
                    containerClassName="h-[calc(100svh-24rem)] min-h-[34rem] rounded-md border"
                    excelFilters
                    filteredSelection={{
                      checkboxName: "selected_quote_item_ids",
                    }}
                  >
                    <TableHeader className="sticky top-0 z-10 bg-background [&_tr]:border-b">
                      <TableRow>
                        {activePriceHeadings.map((heading) => (
                          <TableHead
                            className="h-12 px-3 text-left align-middle font-medium whitespace-nowrap text-foreground"
                            key={heading}
                          >
                            {heading}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody className="[&_tr:last-child]:border-0">
                      {prices.rows.map((price) => (
                        <TableRow
                          className="border-b transition-colors [contain-intrinsic-size:auto_48px] [content-visibility:auto] hover:bg-muted/50"
                          key={price.id}
                        >
                          <TableCell className="p-3 align-middle whitespace-nowrap">
                            <input
                              aria-label={`Select ${price.customerPartCode ?? price.uid}`}
                              name="selected_quote_item_ids"
                              type="checkbox"
                              value={price.id}
                            />
                          </TableCell>
                          <TableCell className="p-3 align-middle whitespace-nowrap">
                            {price.companyName}
                          </TableCell>
                          <TableCell className="p-3 align-middle font-mono whitespace-nowrap">
                            {price.customerPartCode ?? "—"}
                          </TableCell>
                          <TableCell className="p-3 align-middle font-mono whitespace-nowrap">
                            {price.uid}
                          </TableCell>
                          <TableCell className="max-w-64 p-3 align-middle">
                            {price.description}
                          </TableCell>
                          <TableCell className="p-3 align-middle whitespace-nowrap">
                            {price.category ?? "—"}
                          </TableCell>
                          <TableCell className="p-3 align-middle whitespace-nowrap">
                            {price.subcategory ?? "—"}
                          </TableCell>
                          <TableCell className="p-3 align-middle whitespace-nowrap tabular-nums">
                            $ {money(price.approvedPriceUsd)}
                          </TableCell>
                          <TableCell className="p-3 align-middle whitespace-nowrap">
                            {money(price.scrapRate)}
                          </TableCell>
                          <TableCell className="p-3 align-middle whitespace-nowrap">
                            {money(price.packingCost)}
                          </TableCell>
                          <TableCell className="p-3 align-middle whitespace-nowrap">
                            {money(price.shippingCost)}
                          </TableCell>
                          <TableCell className="p-3 align-middle whitespace-nowrap">
                            {money(price.purchaseTimes)}
                          </TableCell>
                          <TableCell className="p-3 align-middle whitespace-nowrap">
                            {percent(price.profitPercent)}
                          </TableCell>
                          <TableCell className="p-3 align-middle whitespace-nowrap">
                            {money(price.conversionRate)}
                          </TableCell>
                        </TableRow>
                      ))}
                      {!prices.rows.length ? (
                        <TableRow>
                          <TableCell className="h-24 text-center" colSpan={14}>
                            No Active Prices Are In Scope.
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
 </OperationalTable>

                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <Field>
                      <FieldLabel htmlFor="customer-bulk-field">
                        Parameter
                      </FieldLabel>
                      <NativeSelect
                        id="customer-bulk-field"
                        name="field_name"
                        required
                      >
                        {customerFields.map(([value, field]) => (
                          <NativeSelectOption key={value} value={value}>
                            {field.label}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="customer-bulk-value">
                        New Value
                      </FieldLabel>
                      <Input
                        id="customer-bulk-value"
                        name="new_value"
                        required
                        step="any"
                        type="number"
                      />
                    </Field>
                    <Field className="sm:col-span-2">
                      <FieldLabel htmlFor="customer-bulk-notes">
                        Change Note
                      </FieldLabel>
                      <Input id="customer-bulk-notes" name="notes" />
                    </Field>
                  </div>
                  <Button
                    className="w-fit"
                    disabled={!prices.rows.length}
                    type="submit"
                  >
                    Stage Selected Prices
                  </Button>
                </form>
              ) : null}

              <div className="grid gap-3 border-t pt-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium">Revision Changes</p>
                    <p className="text-xs text-muted-foreground">
                      Product Stage Previews Are Product Base INR Per Piece.
                      Customer Stage Previews Use Quote Currency. Product Master
                      Publishes Only When The Revision Is Completed.
                    </p>
                  </div>
                  {!isCompleted ? (
                    <form action={completeBulkPriceRevisionAction}>
                      <input
                        name="bulk_price_revision_id"
                        type="hidden"
                        value={selectedRevision.id}
                      />
                      <Button disabled={!stages.length} type="submit">
                        Complete And Create Revisions
                      </Button>
                    </form>
                  ) : null}
                </div>
                {stages.map((stage) => (
                  <div
                    className="grid gap-3 rounded-2xl border bg-muted/20 p-4 [contain-intrinsic-size:auto_120px] [content-visibility:auto]"
                    key={stage.stageGroupId}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="font-medium">
                          {stage.fieldLabel} →{" "}
                          {stage.fieldName === "profit_percent"
                            ? percent(stage.newValue)
                            : money(stage.newValue)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {stage.selectedCount} Selected
                          {stage.skippedCount
                            ? ` · ${stage.skippedCount} Skipped By Process Guard`
                            : ""}
                        </p>
                        {stage.notes ? (
                          <p className="mt-1 text-sm">{stage.notes}</p>
                        ) : null}
                        {stage.skippedRows.map((skipped) => (
                          <p className="mt-1 text-xs text-destructive" key={skipped.itemId}>
                            Skipped {skipped.uid}: {skipped.reason}
                          </p>
                        ))}
                      </div>
                      {!isCompleted && !stage.isApplied ? (
                        <form action={deleteBulkPriceRevisionStageAction}>
                          <input
                            name="bulk_price_revision_id"
                            type="hidden"
                            value={selectedRevision.id}
                          />
                          <input
                            name="stage_group_id"
                            type="hidden"
                            value={stage.stageGroupId}
                          />
                          <Button size="sm" type="submit" variant="ghost">
                            Remove Stage
                          </Button>
                        </form>
                      ) : stage.isApplied ? (
                        <Badge variant="outline">
                          {productFieldNames.has(stage.fieldName)
                            ? "Product Stage Ready"
                            : "Applied Stage"}
                        </Badge>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      {stage.previewRows.map((preview) => (
                        <span
                          className="rounded-full border bg-background px-2 py-1 tabular-nums"
                          key={preview.quoteItemId}
                        >
                          {productFieldNames.has(stage.fieldName) ? (
                            <>
                              Product Base ₹ {money(preview.oldPrice)} → ₹{" "}
                              {money(preview.newPrice)}
                            </>
                          ) : (
                            <>
                              $ {money(preview.oldPrice)} → ${" "}
                              {money(preview.newPrice)}
                            </>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
                {!stages.length ? (
                  <p className="rounded-2xl border p-6 text-center text-sm text-muted-foreground">
                    No Customer Parameter Changes Have Been Staged Yet.
                  </p>
                ) : null}
              </div>
            </>
          ) : selectedRevisionId ? (
            <p className="text-sm text-muted-foreground">
              This Customer Bulk Revision Is No Longer Available In This
              Workflow.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Open One Customer Revision From The Queue To Select Prices And
              Stage Changes.
            </p>
          )}
        </CardContent>
 </SectionCard>
    </div>
  )
}
