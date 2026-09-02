import Link from "next/link"
import { notFound } from "next/navigation"

import { createCommercialRevisionsRepository } from "@workspace/db"
import { Badge } from "@workspace/ui/components/badge"
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

import { readAuthEnvironment } from "@/lib/auth/auth"
import { commercialCapabilities } from "@/lib/auth/commercial-capabilities"
import { requireCapability } from "@/lib/auth/require-capability"

import {
  applyEngineeringChangeDesignReviewAction,
  applyEngineeringChangeDecisionAction,
  completeEngineeringChangeProductCostingAction,
} from "../../revisions/actions"
import { ecnDesignHref } from "@/lib/pricing/ecn-routes"

export const dynamic = "force-dynamic"

const productCostingFields = [
  ["alloy_premium", "Alloy Premium"],
  ["ext_cost", "Extrusion Cost"],
  ["forging_cost", "Forging Cost"],
  ["machining_cost", "Machining Cost"],
  ["washing", "Washing"],
  ["checking", "Checking"],
  ["marking", "Marking"],
  ["plating", "Plating"],
  ["annealing", "Annealing"],
  ["deburring", "Deburring"],
  ["buffing", "Buffing"],
  ["sealant", "Sealant"],
  ["assembly_operation_cost", "Package Assembly Cost"],
  ["overhead_cost", "Overhead Cost"],
  ["rejection_percent", "Rejection %"],
  ["burning_loss_percent", "Burning Loss %"],
] as const

const processForCostingField: Partial<
  Record<(typeof productCostingFields)[number][0], string>
> = {
  annealing: "annealing",
  assembly_operation_cost: "package assembly",
  buffing: "buffing",
  checking: "checking",
  deburring: "deburring",
  machining_cost: "machining",
  marking: "marking",
  plating: "plating",
  sealant: "sealant",
  washing: "washing",
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 4,
    minimumFractionDigits: 2,
  }).format(value)
}

export default async function EngineeringChangeNotePage({
  params,
}: {
  params: Promise<{ ecnId: string }>
}) {
  const { ecnId } = await params
  await requireCapability(
    commercialCapabilities.revisions.read,
    "/commercial/ecns/" + encodeURIComponent(ecnId)
  )
  const repository = createCommercialRevisionsRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const data = await (async () => {
    try {
      const selected = await repository.getEngineeringChangeNote("MRMPL", ecnId)
      const affected =
        selected?.status === "Pending Customer Costing"
          ? await repository.listEngineeringChangeAffectedPrices(selected.id)
          : []
      return { affected, selected }
    } finally {
      await repository.close()
    }
  })()
  if (!data.selected) notFound()
  const { affected, selected } = data

  return (
    <div className="grid gap-6">
      <section className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">
            {selected.ecnNumber}
          </h2>
          <p className="text-sm text-muted-foreground">
            {selected.itemUid} · {selected.description}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/commercial/ecns">Back To ECN Register</Link>
        </Button>
      </section>
 <SectionCard id="ecn-workbench">
        <CardHeader>
          <CardTitle>ECN Workbench</CardTitle>
          <CardDescription>
            The Active Stage Is Editable; Earlier Stages Remain Immutable
            Evidence.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {selected ? (
            <div className="grid gap-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="mb-2 flex flex-wrap gap-2">
                    <Badge
                      variant={
                        selected.status === "Completed"
                          ? "default"
                          : "secondary"
                      }
                    >
                      {selected.status}
                    </Badge>
                    <Badge variant="outline">{selected.itemUid}</Badge>
                  </div>
                  <p className="font-semibold">{selected.ecnNumber}</p>
                  <p className="text-sm text-muted-foreground">
                    {selected.description}
                  </p>
                  <p className="mt-1 text-sm">{selected.reason}</p>
                </div>
                <p className="text-sm text-muted-foreground tabular-nums">
                  {selected.decisionCount} / {selected.affectedPriceCount}{" "}
                  Decisions
                </p>
              </div>
              {selected.designSubmittedAt ? (
                <div className="grid gap-1 rounded-xl border bg-muted/30 p-3 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
                  <span>
                    Submitted: {selected.designSubmittedAt.toLocaleString()}
                  </span>
                  <span>
                    Approved: {selected.designApprovedAt?.toLocaleString() || "—"}
                    {selected.designApprovedBy
                      ? ` by ${selected.designApprovedBy}`
                      : ""}
                  </span>
                  <span>
                    Released Revision: {selected.releasedDesignRevision || "—"}
                  </span>
                  <span>
                    Drawing Revision: {selected.releasedDrawingRevision || "—"}
                  </span>
                  <span>
                    Cost Impact: {selected.costImpacting === null
                      ? "Pending classification"
                      : selected.costImpacting
                        ? selected.costImpactDrivers.join(", ")
                        : "No cost impact"}
                  </span>
                  {selected.designRejectedAt ? (
                    <span className="text-destructive sm:col-span-2 lg:col-span-4">
                      Rejected {selected.designRejectedAt.toLocaleString()}: {selected.designRejectionRemarks}
                    </span>
                  ) : null}
                </div>
              ) : null}
              {selected.status === "Pending Design" ? (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                  <p className="text-sm text-muted-foreground">
                    Product Details, BOM, Files, and Design Controls are managed
                    on the dedicated Design page.
                  </p>
                  <Button asChild>
                    <Link href={ecnDesignHref(selected.id)}>
                      Open Design Workspace
                    </Link>
                  </Button>
                </div>
              ) : null}
              {selected.status === "Pending Design Approval" ? (
                <div className="grid gap-4 border-t pt-4">
                  <div>
                    <p className="text-sm font-medium">Design HOD Review</p>
                    <p className="text-xs text-muted-foreground">
                      Approval releases the next Product Design revision.
                      Rejection returns the same ECN to Design with remarks and
                      leaves the Product, BOM, and drawing unchanged.
                    </p>
                  </div>
                  <div className="grid gap-3 lg:grid-cols-2">
                    <form
                      action={applyEngineeringChangeDesignReviewAction}
                      className="grid gap-2 rounded-xl border p-3"
                    >
                      <input
                        name="engineering_change_note_id"
                        type="hidden"
                        value={selected.id}
                      />
                      <input name="decision" type="hidden" value="Approve" />
                      <Field>
                        <FieldLabel>Approval Remarks</FieldLabel>
                        <Input name="remarks" placeholder="Optional" />
                      </Field>
                      <Button type="submit">Approve Design Revision</Button>
                    </form>
                    <form
                      action={applyEngineeringChangeDesignReviewAction}
                      className="grid gap-2 rounded-xl border border-destructive/40 p-3"
                    >
                      <input
                        name="engineering_change_note_id"
                        type="hidden"
                        value={selected.id}
                      />
                      <input name="decision" type="hidden" value="Reject" />
                      <Field>
                        <FieldLabel>Rejection Remarks</FieldLabel>
                        <Input name="remarks" required />
                      </Field>
                      <Button type="submit" variant="destructive">
                        Reject To Design
                      </Button>
                    </form>
                  </div>
                </div>
              ) : null}
              {selected.status === "Pending Product Costing" ? (
                <form
                  action={completeEngineeringChangeProductCostingAction}
                  className="grid gap-4 border-t pt-4"
                >
                  <input
                    name="engineering_change_note_id"
                    type="hidden"
                    value={selected.id}
                  />
                  <div>
                    <p className="text-sm font-medium">
                      Product Costing Changes
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Blank Values Preserve The Design-Stage Product. Percent
                      Fields Accept Whole Percentages.
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {productCostingFields.map(([name, label]) => (
                      <Field key={name}>
                        <FieldLabel>{label}</FieldLabel>
                        <Input
                          disabled={
                            processForCostingField[name] !== undefined &&
                            !selected.processesRequired
                              .map((process) => process.toLowerCase())
                              .includes(processForCostingField[name])
                          }
                          name={name}
                          step="any"
                          type="number"
                        />
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
                      <Input name="pieces_per_kg" step="any" type="number" />
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
                      <FieldLabel>Stored Product Cost INR</FieldLabel>
                      <Input name="product_cost_inr" step="any" type="number" />
                    </Field>
                  </div>
                  <Button className="w-fit" type="submit">
                    Complete Product Costing
                  </Button>
                </form>
              ) : null}
              {selected.status === "Pending Customer Costing" ? (
                affected.length ? (
                  <div className="grid gap-3 border-t pt-4">
                    {affected.map((price) => (
                      <div
                        className="grid gap-3 rounded-2xl border p-3 lg:grid-cols-[1.1fr_1fr_1fr_2fr]"
                        key={price.quoteItemId}
                      >
                        <div>
                          <p className="font-medium">
                            {price.customerPartCode}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Current USD {money(price.approvedPriceUsd)}
                          </p>
                        </div>
                        <div className="text-sm">
                          <p className="font-medium">Keep Price Same</p>
                          <p className="text-muted-foreground">
                            USD {money(price.keepSamePriceUsd)} · Profit{" "}
                            {money(price.keepSameProfitPercent * 100)}%
                          </p>
                        </div>
                        <div className="text-sm">
                          <p className="font-medium">Revise Price</p>
                          <p className="text-muted-foreground">
                            USD {money(price.revisePriceUsd)} · Profit{" "}
                            {money(price.reviseProfitPercent * 100)}%
                          </p>
                        </div>
                        {price.decision ? (
                          <div className="flex items-center justify-end">
                            <Badge>{price.decision}</Badge>
                          </div>
                        ) : (
                          <form
                            action={applyEngineeringChangeDecisionAction}
                            className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
                          >
                            <input
                              name="engineering_change_note_id"
                              type="hidden"
                              value={selected.id}
                            />
                            <input
                              name="source_quote_item_id"
                              type="hidden"
                              value={price.quoteItemId}
                            />
                            <NativeSelect name="decision" required>
                              <NativeSelectOption value="Keep Price Same">
                                Keep Price Same
                              </NativeSelectOption>
                              <NativeSelectOption value="Revise Price">
                                Revise Price
                              </NativeSelectOption>
                            </NativeSelect>
                            <Input name="notes" placeholder="Decision Note" />
                            <Button type="submit">Record</Button>
                          </form>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="border-t pt-4 text-sm text-muted-foreground">
                    No Active Customer Price Contains This Product.
                  </p>
                )
              ) : null}
              {selected.status === "Completed" ? (
                <p className="border-t pt-4 text-sm text-muted-foreground">
                  This ECN Is Complete. Its Design, Costing, And Customer Price
                  Decisions Are Locked.
                </p>
              ) : null}
            </div>
          ) : ecnId ? (
            <p className="text-sm text-muted-foreground">
              This ECN Was Not Found In The MRMPL Organization.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Open An ECN From The Register To Work On Its Current Stage.
            </p>
          )}
        </CardContent>
 </SectionCard>
    </div>
  )
}
