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
  MetricCard,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { Textarea } from "@workspace/ui/components/textarea"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { commercialCapabilities } from "@/lib/auth/commercial-capabilities"
import { requireCapability } from "@/lib/auth/require-capability"

import {
  applyEngineeringChangeDecisionAction,
  completeEngineeringChangeDesignAction,
  completeEngineeringChangeProductCostingAction,
  createEngineeringChangeNoteAction,
} from "../revisions/actions"
import { EcnBomEditor } from "../revisions/ecn-bom-editor"

export const dynamic = "force-dynamic"

const registerLimit = 100
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

function actionLabel(status: string) {
  if (status === "Pending Design") return "Open Design"
  if (status === "Pending Product Costing") return "Open Product Costing"
  if (status === "Pending Costing") return "Open Customer Costing"
  return "View ECN"
}

export default async function EngineeringChangeNotesPage({
  searchParams,
}: {
  searchParams: Promise<{ ecn?: string }>
}) {
  await requireCapability(
    commercialCapabilities.revisions.read,
    "/commercial/ecns"
  )
  const selectedId = (await searchParams).ecn?.trim() ?? ""
  const repository = createCommercialRevisionsRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const data = await (async () => {
    try {
      const [ecns, metrics, reference, selected] = await Promise.all([
        repository.listEngineeringChangeNotes("MRMPL", {
          limit: registerLimit,
        }),
        repository.getEngineeringChangeMetrics("MRMPL"),
        repository.listEngineeringChangeReferenceData("MRMPL"),
        selectedId
          ? repository.getEngineeringChangeNote("MRMPL", selectedId)
          : Promise.resolve(null),
      ])
      const affected =
        selected?.status === "Pending Costing"
          ? await repository.listEngineeringChangeAffectedPrices(selected.id)
          : []
      return { affected, ecns, metrics, reference, selected }
    } finally {
      await repository.close()
    }
  })()
  const { affected, ecns, metrics, reference, selected } = data

  return (
    <div className="grid gap-6">
      <section className="grid gap-2">
        <h2 className="text-2xl font-semibold tracking-tight">
          Engineering Change Notes
        </h2>
        {ecns.length === registerLimit ? (
          <p className="text-xs text-muted-foreground">
            Showing The Latest {registerLimit} ECNs. Open Work Counts Remain
            Complete.
          </p>
        ) : null}
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Open ECNs" value={metrics.open} />
        <MetricCard label="With Design" value={metrics.pendingDesign} />
        <MetricCard
          label="With Product Costing"
          value={metrics.pendingProductCosting}
        />
        <MetricCard
          label="With Customer Costing"
          value={metrics.pendingCosting}
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Open An Engineering Change Note</CardTitle>
          <CardDescription>
            Only Ordered Internal Portfolio Products Can Enter This Workflow.
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
                    Create ECN
                  </Button>
                </FieldGroup>
              </FieldSet>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">
              The MRMPL Organization Must Be Loaded First.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>ECN Register</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-h-[65vh] overflow-auto rounded-md border">
            <Table containerClassName="max-h-none overflow-visible" excelFilters>
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  <TableHead data-filterable="true">ECN</TableHead>
                  <TableHead data-filterable="true">Created</TableHead>
                  <TableHead data-filterable="true">Product UID</TableHead>
                  <TableHead data-filterable="true">Product</TableHead>
                  <TableHead data-filterable="true">Design Change</TableHead>
                  <TableHead data-filterable="true">Reason</TableHead>
                  <TableHead>Customer Costing</TableHead>
                  <TableHead data-filterable="true">Status</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ecns.map((ecn) => (
                  <TableRow
                    className="[contain-intrinsic-size:auto_48px] [content-visibility:auto]"
                    key={ecn.id}
                  >
                    <TableCell className="font-medium">
                      {ecn.ecnNumber}
                    </TableCell>
                    <TableCell>
                      {ecn.createdAt.toLocaleDateString("en-IN")}
                    </TableCell>
                    <TableCell>{ecn.itemUid}</TableCell>
                    <TableCell className="max-w-80 whitespace-normal">
                      {ecn.description}
                    </TableCell>
                    <TableCell>Design Task Update</TableCell>
                    <TableCell className="max-w-96 whitespace-normal">
                      {ecn.reason}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {ecn.decisionCount} / {ecn.affectedPriceCount}
                    </TableCell>
                    <TableCell data-filter-value={ecn.status}>
                      <Badge
                        variant={
                          ecn.status === "Completed" ? "default" : "secondary"
                        }
                      >
                        {ecn.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button asChild size="sm" variant="outline">
                        <Link
                          href={`/commercial/ecns?ecn=${encodeURIComponent(ecn.id)}#ecn-workbench`}
                        >
                          {actionLabel(ecn.status)}
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!ecns.length ? (
                  <TableRow>
                    <TableCell className="h-24 text-center" colSpan={9}>
                      No Engineering Change Notes Have Been Created.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card id="ecn-workbench">
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

              {selected.status === "Pending Design" ? (
                <form
                  action={completeEngineeringChangeDesignAction}
                  className="grid gap-4 border-t pt-4"
                >
                  <input
                    name="engineering_change_note_id"
                    type="hidden"
                    value={selected.id}
                  />
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <Field className="sm:col-span-2">
                      <FieldLabel>Revised Product Description</FieldLabel>
                      <Input
                        defaultValue={selected.description}
                        name="description"
                      />
                    </Field>
                    <Field>
                      <FieldLabel>Item Type</FieldLabel>
                      <NativeSelect
                        defaultValue={selected.itemType}
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
                      <FieldLabel>Production Type</FieldLabel>
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
                      <FieldLabel>Casting</FieldLabel>
                      <Input min="0" name="casting" step="any" type="number" />
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
                      <FieldLabel>Design / Process Remarks</FieldLabel>
                      <Textarea name="remarks" />
                    </Field>
                  </div>
                  <EcnBomEditor
                    items={reference.items}
                    parentItemId={selected.itemId}
                  />
                  <Button className="w-fit" type="submit">
                    Complete Design And Send To Product Costing
                  </Button>
                </form>
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

              {selected.status === "Pending Costing" ? (
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
          ) : selectedId ? (
            <p className="text-sm text-muted-foreground">
              This ECN Was Not Found In The MRMPL Organization.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Open An ECN From The Register To Work On Its Current Stage.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
