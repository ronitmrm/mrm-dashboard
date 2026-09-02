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
} from "@workspace/ui/components/card"
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import { Textarea } from "@workspace/ui/components/textarea"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { MetricSummary } from "@/components/ui/golden-patterns"
import { commercialCapabilities } from "@/lib/auth/commercial-capabilities"
import { requireCapability } from "@/lib/auth/require-capability"
import { ecnHref } from "@/lib/pricing/ecn-routes"

import {
  completeBulkPriceRevisionAction,
  completeEngineeringChangeDesignAction,
  completeEngineeringChangeProductCostingAction,
  createBulkPriceRevisionAction,
  createEngineeringChangeNoteAction,
  deleteBulkPriceRevisionStageAction,
  stageBulkPriceRevisionAction,
} from "./actions"
import { EcnBomEditor } from "./ecn-bom-editor"

export const dynamic = "force-dynamic"

const bulkFields = Object.entries(bulkRevisionFields)

const productCostingFields = [
  ["alloy_premium", "Alloy premium"],
  ["ext_cost", "Extrusion cost"],
  ["forging_cost", "Forging cost"],
  ["machining_cost", "Machining cost"],
  ["washing", "Washing"],
  ["checking", "Checking"],
  ["marking", "Marking"],
  ["plating", "Plating"],
  ["annealing", "Annealing"],
  ["deburring", "Deburring"],
  ["buffing", "Buffing"],
  ["sealant", "Sealant"],
  ["assembly_operation_cost", "Package assembly cost"],
  ["overhead_cost", "Overhead cost"],
  ["rejection_percent", "Rejection %"],
  ["burning_loss_percent", "Burning loss %"],
] as const

function localDate() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, "0")
  const day = String(now.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 4,
    minimumFractionDigits: 2,
  }).format(value)
}

export default async function CommercialRevisionsPage() {
  await requireCapability(
    commercialCapabilities.revisions.read,
    "/commercial/revisions"
  )
  const repository = createCommercialRevisionsRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const { bulkRevisions, ecns, reference, stagesByRevision } =
    await (async () => {
      const [bulkRevisions, ecns, reference] = await Promise.all([
        repository.listBulkPriceRevisions("MRMPL"),
        repository.listEngineeringChangeNotes("MRMPL"),
        repository.listRevisionReferenceData("MRMPL"),
      ])
      const stagesByRevision = new Map(
        await Promise.all(
          bulkRevisions
            .filter((revision) => revision.status !== "Completed")
            .map(
              async (revision) =>
                [
                  revision.id,
                  await repository.listBulkPriceRevisionStages(revision.id),
                ] as const
            )
        )
      )
      return {
        bulkRevisions,
        ecns,
        reference,
        stagesByRevision,
      }
    })().finally(() => repository.close())

  return (
    <div className="grid gap-6">
      <MetricSummary
        scope="Loaded revision register · before table filters"
        items={[
          {
            label: "Bulk Revisions",
            value: bulkRevisions.length,
            tone: "information"
          },
          {
            label: "Completed",
            value: bulkRevisions.filter((row) => row.status === "Completed")
              .length,
            description: "Completed bulk revisions",
            tone: "positive"
          },
          { label: "ECNs", value: ecns.length, tone: "brand" }
        ]}
      />
      <div className="grid gap-6 xl:grid-cols-2">
 <SectionCard>
          <CardHeader>
            <CardTitle>Start A Bulk Price Revision</CardTitle>
            <CardDescription>
              Stage Active Sent Prices, Then Complete Once. Every Affected
              Package Parent Receives A New Immutable Quote Revision.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {reference.organizationId ? (
              <form action={createBulkPriceRevisionAction}>
                <input
                  name="organization_id"
                  type="hidden"
                  value={reference.organizationId}
                />
                <FieldSet>
                  <FieldLegend>Revision Request</FieldLegend>
                  <FieldGroup>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field>
                        <FieldLabel htmlFor="bulk-route">Route</FieldLabel>
                        <NativeSelect
                          id="bulk-route"
                          name="revision_route"
                          required
                        >
                          <NativeSelectOption value="Customer Parameter Bulk Revision">
                            Customer Parameters
                          </NativeSelectOption>
                          <NativeSelectOption value="Product Parameter Bulk Revision">
                            Product Parameters
                          </NativeSelectOption>
                        </NativeSelect>
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="bulk-effective">
                          Effective Date
                        </FieldLabel>
                        <Input
                          defaultValue={localDate()}
                          id="bulk-effective"
                          name="effective_on"
                          required
                          type="date"
                        />
                      </Field>
                    </div>
                    <Field>
                      <FieldLabel htmlFor="bulk-customer">
                        Customer · Required For Customer Route
                      </FieldLabel>
                      <NativeSelect id="bulk-customer" name="customer_id">
                        <NativeSelectOption value="">
                          No Customer · Product Route
                        </NativeSelectOption>
                        {reference.customers.map((customer) => (
                          <NativeSelectOption
                            key={customer.id}
                            value={customer.id}
                          >
                            {customer.companyName}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="bulk-reason">Reason</FieldLabel>
                      <Textarea id="bulk-reason" name="reason" required />
                    </Field>
                    <Button className="w-fit" type="submit">
                      Create Revision
                    </Button>
                  </FieldGroup>
                </FieldSet>
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
            <CardTitle>Open An Engineering Change Note</CardTitle>
            <CardDescription>
              Design Completes First. Costing Then Records One Keep-Or-Revise
              Decision For Every Recursively Affected Customer Price.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {reference.organizationId ? (
              <form action={createEngineeringChangeNoteAction}>
                <input
                  name="organization_id"
                  type="hidden"
                  value={reference.organizationId}
                />
                <FieldSet>
                  <FieldLegend>Engineering Request</FieldLegend>
                  <FieldGroup>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field>
                        <FieldLabel htmlFor="ecn-item">Product</FieldLabel>
                        <NativeSelect id="ecn-item" name="item_id" required>
                          {reference.items.map((item) => (
                            <NativeSelectOption key={item.id} value={item.id}>
                              {item.uid} · {item.description}
                            </NativeSelectOption>
                          ))}
                        </NativeSelect>
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="ecn-effective">
                          Effective Date
                        </FieldLabel>
                        <Input
                          defaultValue={localDate()}
                          id="ecn-effective"
                          name="effective_on"
                          type="date"
                        />
                      </Field>
                    </div>
                    <Field>
                      <FieldLabel htmlFor="ecn-reason">Reason</FieldLabel>
                      <Textarea id="ecn-reason" name="reason" required />
                    </Field>
                    <Button className="w-fit" type="submit">
                      Create Ecn
                    </Button>
                  </FieldGroup>
                </FieldSet>
              </form>
            ) : null}
          </CardContent>
 </SectionCard>
      </div>

 <SectionCard>
        <CardHeader>
          <CardTitle>Bulk Revision Workbench</CardTitle>
          <CardDescription>
            Percent Fields Accept Whole Percentages, Such As 30 For 30%.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {bulkRevisions.length ? (
            bulkRevisions.map((revision) => {
              const eligiblePrices = reference.activePrices.filter(
                (price) =>
                  !revision.companyName ||
                  price.companyName === revision.companyName
              )
              const stagedChanges = stagesByRevision.get(revision.id) ?? []
              const allowedFields = bulkFields.filter(
                ([, field]) =>
                  field.route ===
                  (revision.revisionRoute === "Product Parameter Bulk Revision"
                    ? "product"
                    : "customer")
              )
              return (
                <div
                  className="grid gap-4 rounded-3xl border p-4"
                  key={revision.id}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="mb-2 flex flex-wrap gap-2">
                        <Badge
                          variant={
                            revision.status === "Completed"
                              ? "default"
                              : "secondary"
                          }
                        >
                          {revision.status}
                        </Badge>
                        <Badge variant="outline">
                          {revision.revisionRoute}
                        </Badge>
                      </div>
                      <p className="font-semibold">{revision.revisionNumber}</p>
                      <p className="text-sm text-muted-foreground">
                        {revision.companyName ?? "All customers"} · Effective{" "}
                        {revision.effectiveOn}
                      </p>
                      <p className="mt-1 text-sm">{revision.reason}</p>
                    </div>
                    <p className="text-sm text-muted-foreground tabular-nums">
                      {revision.changeCount} Staged ·{" "}
                      {revision.revisedQuoteCount} Revised
                    </p>
                  </div>
                  {revision.status !== "Completed" ? (
                    <div className="grid gap-4 border-t pt-4 xl:grid-cols-[1fr_auto]">
                      <form action={stageBulkPriceRevisionAction}>
                        <input
                          name="bulk_price_revision_id"
                          type="hidden"
                          value={revision.id}
                        />
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                          <Field>
                            <FieldLabel htmlFor={`bulk-price-${revision.id}`}>
                              Active Prices
                            </FieldLabel>
                            <NativeSelect
                              disabled={!eligiblePrices.length}
                              id={`bulk-price-${revision.id}`}
                              multiple
                              name="selected_quote_item_ids"
                              required
                            >
                              {eligiblePrices.map((price) => (
                                <NativeSelectOption
                                  key={price.id}
                                  value={price.id}
                                >
                                  {price.companyName} ·{" "}
                                  {price.customerPartCode ?? price.uid} · $
                                  {money(price.approvedPriceUsd)}
                                </NativeSelectOption>
                              ))}
                            </NativeSelect>
                          </Field>
                          <Field>
                            <FieldLabel htmlFor={`bulk-field-${revision.id}`}>
                              Parameter
                            </FieldLabel>
                            <NativeSelect
                              id={`bulk-field-${revision.id}`}
                              name="field_name"
                              required
                            >
                              {allowedFields.map(([value, field]) => (
                                <NativeSelectOption key={value} value={value}>
                                  {field.label}
                                </NativeSelectOption>
                              ))}
                            </NativeSelect>
                          </Field>
                          <Field>
                            <FieldLabel htmlFor={`bulk-value-${revision.id}`}>
                              New Value
                            </FieldLabel>
                            <Input
                              id={`bulk-value-${revision.id}`}
                              name="new_value"
                              required
                              step="any"
                              type="number"
                            />
                          </Field>
                          <Field>
                            <FieldLabel htmlFor={`bulk-notes-${revision.id}`}>
                              Notes
                            </FieldLabel>
                            <Input
                              id={`bulk-notes-${revision.id}`}
                              name="notes"
                            />
                          </Field>
                        </div>
                        <Button
                          className="mt-3"
                          disabled={!eligiblePrices.length}
                          size="sm"
                          type="submit"
                          variant="outline"
                        >
                          Stage Selected Prices
                        </Button>
                      </form>
                      <form
                        action={completeBulkPriceRevisionAction}
                        className="self-end"
                      >
                        <input
                          name="bulk_price_revision_id"
                          type="hidden"
                          value={revision.id}
                        />
                        <Button disabled={!revision.changeCount} type="submit">
                          Complete Revision
                        </Button>
                      </form>
                      {stagedChanges.length ? (
                        <div className="grid gap-2 xl:col-span-2">
                          {stagedChanges.map((stage) => (
                            <div
                              className="flex flex-col gap-3 rounded-2xl border bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between"
                              key={stage.stageGroupId}
                            >
                              <div>
                                <p className="text-sm font-medium">
                                  {stage.fieldLabel} →{" "}
                                  {stage.fieldName === "profit_percent"
                                    ? `${money(stage.newValue * 100)}%`
                                    : money(stage.newValue)}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {stage.selectedCount} Selected
                                  {stage.skippedCount
                                    ? ` · ${stage.skippedCount} skipped by process guard`
                                    : ""}
                                  {" · "}
                                  {stage.previewRows
                                    .map(
                                      (preview) =>
                                        `$${money(preview.oldPrice)} → $${money(preview.newPrice)}`
                                    )
                                    .join(", ")}
                                </p>
                                {stage.notes ? (
                                  <p className="mt-1 text-xs">{stage.notes}</p>
                                ) : null}
                                {stage.skippedRows.map((skipped) => (
                                  <p className="mt-1 text-xs text-destructive" key={skipped.itemId}>
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
                                  Delete Staged Change
                                </Button>
                              </form>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              )
            })
          ) : (
            <p className="rounded-3xl border p-8 text-center text-sm text-muted-foreground">
              No Bulk Price Revisions Have Been Created.
            </p>
          )}
        </CardContent>
 </SectionCard>

 <SectionCard>
        <CardHeader>
          <CardTitle>Engineering Change Workbench</CardTitle>
          <CardDescription>
            Design And Costing Remain Separate, Matching The Source Workflow.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {ecns.length ? (
            ecns.map((ecn) => {
              return (
                <div className="grid gap-4 rounded-3xl border p-4" key={ecn.id}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="mb-2 flex flex-wrap gap-2">
                        <Badge
                          variant={
                            ecn.status === "Completed" ? "default" : "secondary"
                          }
                        >
                          {ecn.status}
                        </Badge>
                        <Badge variant="outline">{ecn.itemUid}</Badge>
                      </div>
                      <p className="font-semibold">{ecn.ecnNumber}</p>
                      <p className="text-sm text-muted-foreground">
                        {ecn.description}
                      </p>
                      <p className="mt-1 text-sm">{ecn.reason}</p>
                    </div>
                    <p className="text-sm text-muted-foreground tabular-nums">
                      {ecn.decisionCount} Decisions
                    </p>
                  </div>
                  {ecn.status === "Pending Design" ? (
                    <form
                      action={completeEngineeringChangeDesignAction}
                      className="grid gap-4 border-t pt-4"
                    >
                      <input
                        name="engineering_change_note_id"
                        type="hidden"
                        value={ecn.id}
                      />
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <Field className="sm:col-span-2">
                          <FieldLabel>Revised Product Description</FieldLabel>
                          <Input
                            defaultValue={ecn.description}
                            name="description"
                          />
                        </Field>
                        <Field>
                          <FieldLabel>Item Type</FieldLabel>
                          <NativeSelect
                            defaultValue={ecn.itemType}
                            name="item_type"
                          >
                            <NativeSelectOption value="List">
                              List
                            </NativeSelectOption>
                            <NativeSelectOption value="Package">
                              Package
                            </NativeSelectOption>
                            <NativeSelectOption value="Assembly">
                              Assembly
                            </NativeSelectOption>
                          </NativeSelect>
                        </Field>
                        <Field>
                          <FieldLabel>Product Type</FieldLabel>
                          <Input name="production_type" />
                        </Field>
                        <Field>
                          <FieldLabel>One-Piece Weight (G)</FieldLabel>
                          <Input
                            min="0"
                            name="weight_100_pcs"
                            step="any"
                            type="number"
                          />
                        </Field>
                        <Field>
                          <FieldLabel>Blank Piece Weight ( gm )</FieldLabel>
                          <Input
                            min="0"
                            name="casting"
                            step="any"
                            type="number"
                          />
                        </Field>
                        <Field>
                          <FieldLabel>Rod Size</FieldLabel>
                          <Input name="rod_size" />
                        </Field>
                        <Field>
                          <FieldLabel>Die Code</FieldLabel>
                          <Input name="die_code" />
                        </Field>
                        <Field className="sm:col-span-2 xl:col-span-4">
                          <FieldLabel>Design/Process Remarks</FieldLabel>
                          <Textarea name="remarks" />
                        </Field>
                      </div>
                      <EcnBomEditor
                        items={reference.items}
                        parentItemId={ecn.itemId}
                      />
                      <Button className="w-fit" type="submit">
                        Complete Design And Send To Product Costing
                      </Button>
                    </form>
                  ) : null}
                  {ecn.status === "Pending Product Costing" ? (
                    <form
                      action={completeEngineeringChangeProductCostingAction}
                      className="grid gap-4 border-t pt-4"
                    >
                      <input
                        name="engineering_change_note_id"
                        type="hidden"
                        value={ecn.id}
                      />
                      <div>
                        <p className="text-sm font-medium">
                          Product Costing Changes
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Blank Values Preserve The Design-Stage Product.
                          Percent Fields Accept Whole Percentages.
                        </p>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        {productCostingFields.map(([name, label]) => (
                          <Field key={name}>
                            <FieldLabel>{label}</FieldLabel>
                            <Input name={name} step="any" type="number" />
                          </Field>
                        ))}
                        <Field>
                          <FieldLabel>Pricing Method</FieldLabel>
                          <NativeSelect name="pricing_method">
                            <NativeSelectOption value="">
                              Preserve Current
                            </NativeSelectOption>
                            <NativeSelectOption value="Derived">
                              Derived
                            </NativeSelectOption>
                            <NativeSelectOption value="Direct Purchase">
                              Direct Purchase
                            </NativeSelectOption>
                          </NativeSelect>
                        </Field>
                        <Field>
                          <FieldLabel>Pieces / Kg</FieldLabel>
                          <Input
                            name="pieces_per_kg"
                            step="any"
                            type="number"
                          />
                        </Field>
                        <Field>
                          <FieldLabel>Direct Purchase / Kg</FieldLabel>
                          <Input
                            name="direct_purchase_price_per_kg"
                            step="any"
                            type="number"
                          />
                        </Field>
                        <Field>
                          <FieldLabel>Direct Purchase / Piece</FieldLabel>
                          <Input
                            name="direct_purchase_price_per_piece"
                            step="any"
                            type="number"
                          />
                        </Field>
                        <Field>
                          <FieldLabel>Stored Product Cost Inr</FieldLabel>
                          <Input
                            name="product_cost_inr"
                            step="any"
                            type="number"
                          />
                        </Field>
                      </div>
                      <Button className="w-fit" type="submit">
                        Complete Product Costing
                      </Button>
                    </form>
                  ) : null}
                  {ecn.status === "Pending Customer Costing" ? (
                    <div className="border-t pt-4">
                      <Button asChild variant="outline">
                        <Link href={ecnHref(ecn.id)}>
                          Open Customer Costing
                        </Link>
                      </Button>
                    </div>
                  ) : null}
                </div>
              )
            })
          ) : (
            <p className="rounded-3xl border p-8 text-center text-sm text-muted-foreground">
              No Engineering Change Notes Have Been Created.
            </p>
          )}
        </CardContent>
 </SectionCard>
    </div>
  )
}
