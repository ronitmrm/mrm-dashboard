import Link from "next/link"

import {
  bulkRevisionFields,
  createCommercialRevisionsRepository,
} from "@workspace/db"
import { Button } from "@workspace/ui/components/button"
import {
  SectionCard,
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
import { BulkProductSelectionTable } from "./bulk-product-selection-table"

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
const bulkRevisionTableLimit = 10_000

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
}: {
  params: Promise<{ revisionId: string }>
}) {
  await requireCapability(
    commercialCapabilities.revisions.read,
    "/commercial/product-costing"
  )
  const { revisionId: rawRevisionId } = await params
  const revisionId = validUuid(rawRevisionId) ? rawRevisionId : ""
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
              limit: bulkRevisionTableLimit,
            })
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
      return { products, revision, stages }
    } finally {
      await repository.close()
    }
  })()
  const { products, revision, stages } = data

  if (!revision) {
    return (
      <SectionCard>
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
      </SectionCard>
    )
  }

  return (
    <div className="grid gap-4">
      <div className="flex justify-end">
        <Button asChild variant="outline">
          <Link href="/commercial/product-costing">
            Back To Product Costing
          </Link>
        </Button>
      </div>

      <SectionCard>
        <CardHeader>
          <CardTitle>Products In Scope</CardTitle>
          <CardDescription>
            Filter any column to find products, then select the matching rows.
            Scroll horizontally for all product parameters and process costs.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          <form action={stageBulkPriceRevisionAction} className="grid gap-4">
            <input
              name="bulk_price_revision_id"
              type="hidden"
              value={revision.id}
            />
            <BulkProductSelectionTable
              storageKey={`mrmpl:product-revision:${revision.id}:filters`}
              columns={[
                "UID",
                "Description",
                "Grade",
                "Size",
                "Category",
                "Subcategory",
                "Rejection %",
                "List / Package",
                "Product Type",
                "Production Type",
                "UID Kind",
                "Product Status",
                "Rod Size",
                "Rod Type",
                "Die Code",
                "Pricing Method",
                "Affected Prices",
                "Current Product Base (₹/pc)",
                "Pcs/Kg",
                "1 Piece Weight (gm)",
                "Blank Piece Weight (gm)",
                "Burning Loss %",
                "Direct Purchase (INR/kg)",
                "Direct Purchase (INR/pc)",
                "Alloy Premium (INR/kg)",
                "Extrusion (INR/kg)",
                "Forging (INR/kg)",
                "M/C (INR/kg)",
                "M/C (INR/pc)",
                "Washing (INR/kg)",
                "Checking (INR/kg)",
                "Marking (INR/kg)",
                "Plating (INR/kg)",
                "Annealing (INR/kg)",
                "Deburring (INR/kg)",
                "Buffing (INR/kg)",
                "Sealant (INR/kg)",
                "Assembly (INR/kg)",
                "Overhead (INR/kg)",
                "Remarks",
              ]}
              rows={products.rows.map((product) => ({
                id: product.id,
                uid: product.uid,
                values: [
                  product.uid,
                  product.description,
                  product.grade ?? "—",
                  product.productSize ?? "—",
                  product.category ?? "—",
                  product.subcategory ?? "—",
                  `${money(product.rejectionPercent * 100)}%`,
                  product.itemType,
                  product.productionType ?? "—",
                  product.machineType ?? "—",
                  product.uidKind,
                  product.lifecycleStatus,
                  product.rodSize ?? "—",
                  product.rodType ?? "—",
                  product.dieCode ?? "—",
                  product.pricingMethod,
                  product.affectedPriceCount,
                  money(product.productCostInr),
                  money(product.piecesPerKg),
                  money(product.weight100Pcs),
                  money(product.casting),
                  `${money(product.burningLossPercent * 100)}%`,
                  money(product.directPurchasePricePerKg),
                  money(product.directPurchasePricePerPiece),
                  money(product.alloyPremium),
                  money(product.extCost),
                  money(product.forgingCost),
                  money(product.machiningCost),
                  money(product.machiningPricePerPiece),
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
                  product.remarks || "—",
                ].map(String),
              }))}
            />

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
                      {stage.fieldLabel} →{" "}
                      {productFields.find(([name]) => name === stage.fieldName)?.[1]
                        .valueType === "percent"
                        ? `${money(stage.newValue * 100)}%`
                        : money(stage.newValue)}
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
                    {stage.skippedRows.map((skipped) => (
                      <p
                        className="mt-1 text-xs text-destructive"
                        key={skipped.itemId}
                      >
                        Skipped {skipped.uid}: {skipped.reason}
                      </p>
                    ))}
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
                      key={`${preview.quoteItemId}:${preview.productItemId}`}
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
      </SectionCard>
    </div>
  )
}
