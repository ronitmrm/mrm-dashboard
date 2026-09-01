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

import { BoundedResultNotice } from "@/components/bounded-result-notice"
import { readAuthEnvironment } from "@/lib/auth/auth"
import { commercialCapabilities } from "@/lib/auth/commercial-capabilities"
import { requireCapability } from "@/lib/auth/require-capability"

import {
  completeBulkPriceRevisionAction,
  deleteBulkPriceRevisionStageAction,
  stageBulkPriceRevisionAction,
} from "../../../revisions/actions"

export const dynamic = "force-dynamic"

const productFields = Object.entries(bulkRevisionFields).filter(
  ([, field]) => field.route === "product"
)

const numberFormatter = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 4,
  minimumFractionDigits: 2,
})
const money = (value: number) => numberFormatter.format(value)

function validUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  )
}

export default async function ProductRevisionCostingPage({
  params,
  searchParams,
}: {
  params: Promise<{ revisionId: string }>
  searchParams: Promise<{ productSearch?: string }>
}) {
  await requireCapability(
    commercialCapabilities.revisions.read,
    "/commercial/product-costing"
  )
  const { revisionId: rawRevisionId } = await params
  const revisionId = validUuid(rawRevisionId) ? rawRevisionId : ""
  const productSearch = (await searchParams).productSearch?.trim() ?? ""
  const repository = createCommercialRevisionsRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const data = await (async () => {
    try {
      const [revision, stages, products] = await Promise.all([
        revisionId
          ? repository.getProductBulkPriceRevision("MRMPL", revisionId)
          : Promise.resolve(null),
        revisionId
          ? repository.listBulkPriceRevisionStages(revisionId)
          : Promise.resolve([]),
        revisionId
          ? repository.listProductBulkRevisionActivePricesBounded(revisionId, {
              query: productSearch,
            })
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
      return { products, revision, stages }
    } finally {
      await repository.close()
    }
  })()
  const { products, revision, stages } = data

  if (!revision) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Product Revision Not Available</CardTitle>
          <CardDescription>
            This revision is completed, handed to customer costing, or does not
            exist.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href="/commercial/product-costing">
              Back To Product Costing
            </Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="grid gap-6">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="mb-2 flex flex-wrap gap-2">
            <Badge variant="secondary">{revision.status}</Badge>
            <Badge variant="outline">Product Parameter Bulk Revision</Badge>
          </div>
          <h1 className="font-mono text-2xl font-semibold">
            {revision.revisionNumber}
          </h1>
          <p className="text-sm text-muted-foreground">
            Effective {revision.effectiveOn} · {revision.reason}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/commercial/product-costing">
            Back To Product Costing
          </Link>
        </Button>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Products In Scope</CardTitle>
          <CardDescription>
            Each product UID appears once. This table shows the current
            published Product Master. Staged Product Base values remain
            separate until the complete revision is published.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          <div className="grid gap-2">
            <form className="flex max-w-3xl gap-2" method="get">
              <Input
                aria-label="Search products"
                defaultValue={productSearch}
                name="productSearch"
                placeholder="Search product UID, description, type, or production"
              />
              <Button type="submit" variant="outline">
                Search Products
              </Button>
            </form>
            <BoundedResultNotice
              coverage={products.coverage}
              searchQuery={productSearch}
              section="Unique products"
            />
          </div>

          <form action={stageBulkPriceRevisionAction} className="grid gap-4">
            <input
              name="bulk_price_revision_id"
              type="hidden"
              value={revision.id}
            />
            <div className="max-h-[34rem] overflow-auto rounded-md border">
              <Table className="tabular-nums">
                <TableHeader className="sticky top-0 z-10 bg-background">
                  <TableRow>
                    <TableHead>Select</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Production</TableHead>
                    <TableHead>Affected Prices</TableHead>
                    <TableHead>Current Product Base (₹/pc)</TableHead>
                    <TableHead>Pcs/Kg</TableHead>
                    <TableHead>Weight (g)</TableHead>
                    <TableHead>Rejection</TableHead>
                    <TableHead>Alloy</TableHead>
                    <TableHead>Extrusion</TableHead>
                    <TableHead>Forging</TableHead>
                    <TableHead>M/C</TableHead>
                    <TableHead>Washing</TableHead>
                    <TableHead>Checking</TableHead>
                    <TableHead>Marking</TableHead>
                    <TableHead>Plating</TableHead>
                    <TableHead>Annealing</TableHead>
                    <TableHead>Deburring</TableHead>
                    <TableHead>Buffing</TableHead>
                    <TableHead>Sealant</TableHead>
                    <TableHead>Assembly</TableHead>
                    <TableHead>Overhead</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.rows.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell>
                        <input
                          aria-label={`Select ${product.uid}`}
                          name="selected_product_ids"
                          type="checkbox"
                          value={product.id}
                        />
                      </TableCell>
                      <TableCell className="min-w-64">
                        <span className="font-mono">{product.uid}</span>
                        <span className="block text-xs text-muted-foreground">
                          {product.description}
                        </span>
                      </TableCell>
                      {[
                        product.itemType,
                        product.productionType ?? "—",
                        product.affectedPriceCount,
                        money(product.productCostInr),
                        money(product.piecesPerKg),
                        money(product.weight100Pcs),
                        `${money(product.rejectionPercent * 100)}%`,
                        money(product.alloyPremium),
                        money(product.extCost),
                        money(product.forgingCost),
                        money(product.machiningCost),
                        money(product.washing),
                        money(product.checking),
                        money(product.marking),
                        money(product.plating),
                        money(product.annealing),
                        money(product.deburring),
                        money(product.buffing),
                        money(product.sealant),
                        money(product.assemblyOperationCost),
                        money(product.overheadCost),
                      ].map((value, index) => (
                        <TableCell
                          className="whitespace-nowrap"
                          key={`${product.id}-${index}`}
                        >
                          {value}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                  {!products.rows.length ? (
                    <TableRow>
                      <TableCell className="h-24 text-center" colSpan={22}>
                        No Products Match This Search.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>

            <div className="grid gap-3 md:grid-cols-[1fr_1fr_2fr_auto] md:items-end">
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
                <FieldLabel htmlFor="product-bulk-value">New Value</FieldLabel>
                <Input
                  id="product-bulk-value"
                  name="new_value"
                  required
                  step="any"
                  type="number"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="product-bulk-notes">
                  Change Note
                </FieldLabel>
                <Input id="product-bulk-notes" name="notes" />
              </Field>
              <Button disabled={!products.rows.length} type="submit">
                Stage Products
              </Button>
            </div>
          </form>

          <section className="grid gap-3 border-t pt-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium">Staged Product Changes</p>
                <p className="text-xs text-muted-foreground">
                  Product Base previews are INR per piece before customer
                  commercial inputs.
                </p>
              </div>
              <form action={completeBulkPriceRevisionAction}>
                <input
                  name="bulk_price_revision_id"
                  type="hidden"
                  value={revision.id}
                />
                <input name="handoff_to_customer" type="hidden" value="true" />
                <Button disabled={!stages.length} type="submit">
                  Send Staged Changes To Customer Costing
                </Button>
              </form>
            </div>
            {stages.map((stage) => (
              <div
                className="grid gap-3 rounded-xl border p-4"
                key={stage.stageGroupId}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-medium">
                      {stage.fieldLabel} → {money(stage.newValue)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {stage.selectedCount} Product(s)
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
                      value={revision.id}
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
                      className="rounded-full border px-2 py-1 tabular-nums"
                      key={preview.quoteItemId}
                    >
                      Product Base ₹ {money(preview.oldPrice)} → ₹{" "}
                      {money(preview.newPrice)}
                    </span>
                  ))}
                </div>
              </div>
            ))}
            {!stages.length ? (
              <p className="rounded-xl border p-6 text-center text-sm text-muted-foreground">
                No Product Parameter Changes Have Been Staged Yet.
              </p>
            ) : null}
          </section>
        </CardContent>
      </Card>
    </div>
  )
}
