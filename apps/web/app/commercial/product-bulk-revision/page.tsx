import Link from "next/link"

import {
  bulkRevisionFields,
  createCommercialRevisionsRepository,
} from "@workspace/db"
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
import { Field, FieldLabel } from "@workspace/ui/components/field"
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

const productFields = Object.entries(bulkRevisionFields).filter(
  ([, field]) => field.route === "product"
)

const numberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 4,
  minimumFractionDigits: 2,
})

const money = (value: number) => numberFormatter.format(value)

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

export default async function ProductBulkRevisionPage({
  searchParams,
}: {
  searchParams: Promise<{ priceSearch?: string; revision?: string }>
}) {
  await requireCapability(
    commercialCapabilities.revisions.read,
    "/commercial/product-bulk-revision"
  )
  const params = await searchParams
  const selectedRevisionId = validUuid(params.revision?.trim() ?? "")
    ? params.revision!.trim()
    : ""
  const priceSearch = params.priceSearch?.trim() ?? ""
  const repository = createCommercialRevisionsRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const data = await (async () => {
    try {
      const [queue, summary, selectedRevision, stages, prices] =
        await Promise.all([
          repository.listProductBulkPriceRevisionsBounded("MRMPL"),
          repository.getProductBulkRevisionSummary("MRMPL"),
          selectedRevisionId
            ? repository.getProductBulkPriceRevision(
                "MRMPL",
                selectedRevisionId
              )
            : Promise.resolve(null),
          selectedRevisionId
            ? repository.listBulkPriceRevisionStages(selectedRevisionId)
            : Promise.resolve([]),
          selectedRevisionId
            ? repository.listProductBulkRevisionActivePricesBounded(
                selectedRevisionId,
                { query: priceSearch }
              )
            : Promise.resolve({
                coverage: {
                  limit: 200,
                  returned: 0,
                  total: 0,
                  truncated: false,
                },
                rows: [],
              }),
        ])
      return { prices, queue, selectedRevision, stages, summary }
    } finally {
      await repository.close()
    }
  })()
  const { prices, queue, selectedRevision, stages, summary } = data

  return (
    <div className="grid gap-6">
      <section className="grid gap-2">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Product Parameter Bulk Revision
            </h1>
          </div>
          <Button asChild variant="outline">
            <Link href="/commercial/revisions">All Price Revisions</Link>
          </Button>
        </div>
        <BoundedResultNotice
          coverage={queue.coverage}
          section="Product bulk revision queue"
        />
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Product Revision Requests"
          value={summary.openRevisionCount}
        />
        <MetricCard
          label="Product Changes Staged"
          value={summary.stagedChangeCount}
        />
        <MetricCard
          label="Customer Prices In Scope"
          value={summary.activePriceCount}
        />
        <MetricCard label="Current Stage" value="Product" />
      </section>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Start A Product Revision</CardTitle>
            <CardDescription>
              Record Why Product Cost Parameters Need To Change Across Active
              Customer Prices.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {summary.organizationId ? (
              <form
                action={createBulkPriceRevisionAction}
                className="grid gap-4"
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
                    id="product-revision-reason"
                    name="reason"
                    required
                  />
                </Field>
                <Button className="w-fit" type="submit">
                  Send Product Revision To Costing
                </Button>
              </form>
            ) : (
              <p className="text-sm text-muted-foreground">
                The Mrmpl Organization Must Be Loaded First.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Product Revision Queue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-[34rem] overflow-auto rounded-md border">
              <Table excelFilters>
                <TableHeader className="sticky top-0 z-10 bg-background">
                  <TableRow>
                    <TableHead data-filterable="true">Request</TableHead>
                    <TableHead>Active Prices</TableHead>
                    <TableHead>Staged</TableHead>
                    <TableHead data-filterable="true">Effective</TableHead>
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
                      <TableCell className="tabular-nums">
                        {revision.activePriceCount}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {revision.changeCount}
                      </TableCell>
                      <TableCell>{revision.effectiveOn}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{revision.status}</Badge>
                      </TableCell>
                      <TableCell>
                        <Button asChild size="sm" variant="outline">
                          <Link
                            href={`/commercial/product-bulk-revision?revision=${encodeURIComponent(revision.id)}#product-bulk-workbench`}
                          >
                            Open Product Revision
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!queue.rows.length ? (
                    <TableRow>
                      <TableCell className="h-24 text-center" colSpan={6}>
                        No Product Parameter Bulk Revisions Are Pending.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card hidden={!selectedRevisionId} id="product-bulk-workbench">
        <CardHeader>
          <CardTitle>Product Revision Workbench</CardTitle>
          <CardDescription>
            Price Candidates Are Server-Searchable And Capped At 200 Rows.
            Process Fields Skip Products Where That Process Is Not Active.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          {selectedRevision ? (
            <>
              <div className="flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="mb-2 flex flex-wrap gap-2">
                    <Badge variant="secondary">{selectedRevision.status}</Badge>
                    <Badge variant="outline">
                      {selectedRevision.revisionRoute}
                    </Badge>
                  </div>
                  <p className="font-mono font-semibold">
                    {selectedRevision.revisionNumber}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    All Customers · Effective {selectedRevision.effectiveOn}
                  </p>
                  <p className="mt-2 text-sm whitespace-pre-wrap">
                    {selectedRevision.reason}
                  </p>
                </div>
                <Button asChild size="sm" variant="ghost">
                  <Link href="/commercial/product-bulk-revision#product-bulk-workbench">
                    Close Workbench
                  </Link>
                </Button>
              </div>

              <div className="grid gap-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <form className="flex flex-1 gap-2" method="get">
                    <input
                      name="revision"
                      type="hidden"
                      value={selectedRevision.id}
                    />
                    <Input
                      aria-label="Search active prices across customers"
                      defaultValue={priceSearch}
                      name="priceSearch"
                      placeholder="Search customer, part, quote, UID, or description"
                    />
                    <Button type="submit" variant="outline">
                      Search Prices
                    </Button>
                  </form>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {selectedRevision.activePriceCount} Active Prices In Scope
                  </p>
                </div>
                <BoundedResultNotice
                  coverage={prices.coverage}
                  searchQuery={priceSearch}
                  section="Active cross-customer prices"
                />
              </div>

              <form
                action={stageBulkPriceRevisionAction}
                className="grid gap-4"
              >
                <input
                  name="bulk_price_revision_id"
                  type="hidden"
                  value={selectedRevision.id}
                />
                <div className="max-h-[36rem] overflow-auto rounded-md border">
                  <Table className="w-full caption-bottom text-sm">
                    <TableHeader className="sticky top-0 z-10 bg-background [&_tr]:border-b">
                      <TableRow>
                        {[
                          "Select",
                          "Customer",
                          "Customer Part",
                          "Product",
                          "Type",
                          "Production",
                          "Current Price",
                          "Pcs/Kg",
                          "Blank Piece Weight ( gm )",
                          "Alloy",
                          "Extrusion",
                          "Forging",
                          "M/c",
                          "Washing",
                          "Checking",
                          "Marking",
                          "Plating",
                          "Annealing",
                          "Deburring",
                          "Buffing",
                          "Sealant",
                          "Assembly",
                          "Overhead",
                        ].map((heading) => (
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
                          <TableCell className="p-3 align-middle">
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
                          <TableCell className="p-3 align-middle whitespace-nowrap">
                            <span className="font-mono">{price.uid}</span>
                            <span className="block max-w-64 text-xs text-muted-foreground">
                              {price.description}
                            </span>
                          </TableCell>
                          {[
                            price.itemType,
                            price.productionType ?? "—",
                            `$ ${money(price.approvedPriceUsd)}`,
                            money(price.piecesPerKg),
                            money(price.casting),
                            money(price.alloyPremium),
                            money(price.extCost),
                            money(price.forgingCost),
                            money(price.machiningCost),
                            money(price.washing),
                            money(price.checking),
                            money(price.marking),
                            money(price.plating),
                            money(price.annealing),
                            money(price.deburring),
                            money(price.buffing),
                            money(price.sealant),
                            money(price.assemblyOperationCost),
                            money(price.overheadCost),
                          ].map((value, index) => (
                            <TableCell
                              className="p-3 align-middle whitespace-nowrap tabular-nums"
                              key={`${price.id}-${index}`}
                            >
                              {value}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                      {!prices.rows.length ? (
                        <TableRow>
                          <TableCell className="h-24 text-center" colSpan={23}>
                            No Active Prices Match This Search.
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <Field>
                    <FieldLabel htmlFor="product-bulk-field">
                      Product Parameter
                    </FieldLabel>
                    <NativeSelect
                      id="product-bulk-field"
                      name="field_name"
                      required
                    >
                      {productFields.map(([value, field]) => (
                        <NativeSelectOption key={value} value={value}>
                          {field.label}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="product-bulk-value">
                      New Value
                    </FieldLabel>
                    <Input
                      id="product-bulk-value"
                      name="new_value"
                      required
                      step="any"
                      type="number"
                    />
                  </Field>
                  <Field className="sm:col-span-2">
                    <FieldLabel htmlFor="product-bulk-notes">
                      Change Note
                    </FieldLabel>
                    <Input id="product-bulk-notes" name="notes" />
                  </Field>
                </div>
                <Button
                  className="w-fit"
                  disabled={!prices.rows.length}
                  type="submit"
                >
                  Stage Selected Products
                </Button>
              </form>

              <div className="grid gap-3 border-t pt-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium">Staged Product Changes</p>
                    <p className="text-xs text-muted-foreground">
                      Completion Updates Product Master And Hands Every Active
                      Price For The Selected Product To Customer Costing.
                    </p>
                  </div>
                  <form action={completeBulkPriceRevisionAction}>
                    <input
                      name="bulk_price_revision_id"
                      type="hidden"
                      value={selectedRevision.id}
                    />
                    <input
                      name="handoff_to_customer"
                      type="hidden"
                      value="true"
                    />
                    <Button disabled={!stages.length} type="submit">
                      Save Product Changes &amp; Send To Customer Costing
                    </Button>
                  </form>
                </div>
                {stages.map((stage) => (
                  <div
                    className="grid gap-3 rounded-2xl border bg-muted/20 p-4 [contain-intrinsic-size:auto_120px] [content-visibility:auto]"
                    key={stage.stageGroupId}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="font-medium">
                          {stage.fieldLabel} → {money(stage.newValue)}
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
                      </div>
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
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      {stage.previewRows.map((preview) => (
                        <span
                          className="rounded-full border bg-background px-2 py-1 tabular-nums"
                          key={preview.quoteItemId}
                        >
                          $ {money(preview.oldPrice)} → ${" "}
                          {money(preview.newPrice)}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
                {!stages.length ? (
                  <p className="rounded-2xl border p-6 text-center text-sm text-muted-foreground">
                    No Product Parameter Changes Have Been Staged Yet.
                  </p>
                ) : null}
              </div>
            </>
          ) : selectedRevisionId ? (
            <p className="text-sm text-muted-foreground">
              This Product Bulk Revision Has Moved To Customer Costing Or Is No
              Longer Available.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Open One Product Revision From The Queue To Select Prices And
              Stage Product Parameter Changes.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
