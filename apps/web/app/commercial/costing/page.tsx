import Link from "next/link"

import { createCommercialCostingRepository } from "@workspace/db"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
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
import { Separator } from "@workspace/ui/components/separator"
import { Textarea } from "@workspace/ui/components/textarea"

import { CostingCalculator } from "@/components/commercial/costing-calculator"
import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"

import {
  saveQuoteAction,
  sendQuoteBackToProductCostingAction,
  updateProductCostingAction,
} from "./actions"

function NumberField({
  defaultValue,
  id,
  label,
  name,
  step = "0.0001",
}: {
  defaultValue: number
  id: string
  label: string
  name: string
  step?: string
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        defaultValue={defaultValue}
        id={id}
        min="0"
        name={name}
        step={step}
        type="number"
      />
    </Field>
  )
}

function percent(value: number) {
  return Number((value * 100).toFixed(6))
}

export default async function CostingPage() {
  await requireCapability("pricing.costing.read", "/commercial/costing")

  const repository = createCommercialCostingRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const tasks = await repository
    .listCostingTasks("MRMPL")
    .finally(() => repository.close())

  return (
    <div className="grid gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Product Costing
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Complete Product Parameters, Calculate Customer Pricing, And Retain
            Every Revision As An Immutable Postgresql Snapshot.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/commercial/quotes">View Quote Register</Link>
        </Button>
      </div>

      {tasks.length ? (
        tasks.map((task) => {
          const prefix = task.enquiryItemId
          const quoteReady = [
            "Product Costing Complete",
            "Started",
            "Quoted",
          ].includes(task.nextStageStatus)
          const uniqueBomItems = [
            ...new Map(
              task.bomItems.map((item) => [item.itemId, item])
            ).values(),
          ]
          const leafItems = uniqueBomItems.filter(
            (item) => item.itemType === "List"
          )
          const assemblyItems = uniqueBomItems.filter(
            (item) => item.itemType !== "List"
          )

          return (
            <Card key={task.enquiryItemId}>
              <CardHeader className="gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle>{task.uid}</CardTitle>
                  <Badge variant="secondary">{task.itemType}</Badge>
                  <Badge variant={quoteReady ? "default" : "outline"}>
                    {task.nextStageStatus}
                  </Badge>
                </div>
                <CardDescription>
                  {task.enquiryNumber} · {task.companyName}
                  {task.customerPartCode
                    ? ` · Customer part ${task.customerPartCode}`
                    : ""}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-8">
                <form action={updateProductCostingAction}>
                  <input name="item_id" type="hidden" value={task.itemId} />
                  <FieldSet>
                    <FieldLegend>Product Parameters</FieldLegend>
                    <FieldGroup>
                      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                        <NumberField
                          defaultValue={task.product.weight100Pcs}
                          id={`${prefix}-weight`}
                          label="One-Piece Weight (G)"
                          name="weight_100_pcs"
                        />
                        <NumberField
                          defaultValue={task.product.piecesPerKg}
                          id={`${prefix}-pieces`}
                          label="Pieces / Kg"
                          name="pieces_per_kg"
                        />
                        <Field>
                          <FieldLabel htmlFor={`${prefix}-pricing-method`}>
                            Pricing Method
                          </FieldLabel>
                          <NativeSelect
                            defaultValue={task.product.pricingMethod}
                            id={`${prefix}-pricing-method`}
                            name="pricing_method"
                          >
                            <NativeSelectOption value="Derived">
                              Derived
                            </NativeSelectOption>
                            <NativeSelectOption value="Direct Purchase">
                              Direct Purchase
                            </NativeSelectOption>
                          </NativeSelect>
                        </Field>
                        <NumberField
                          defaultValue={task.product.directPurchasePricePerKg}
                          id={`${prefix}-purchase`}
                          label="Direct Purchase ₹ / Kg"
                          name="direct_purchase_price_per_kg"
                        />
                        <NumberField
                          defaultValue={task.product.alloyPremium}
                          id={`${prefix}-alloy`}
                          label="Alloy Premium ₹ / Kg"
                          name="alloy_premium"
                        />
                        <NumberField
                          defaultValue={task.product.extrusionCost}
                          id={`${prefix}-extrusion`}
                          label="Extrusion ₹ / Kg"
                          name="extrusion_cost"
                        />
                        <NumberField
                          defaultValue={task.product.forgingCost}
                          id={`${prefix}-forging`}
                          label="Forging ₹ / Kg"
                          name="forging_cost"
                        />
                        <NumberField
                          defaultValue={task.product.machiningCost}
                          id={`${prefix}-machining`}
                          label="Machining ₹ / Kg"
                          name="machining_cost"
                        />
                        <NumberField
                          defaultValue={task.product.washing}
                          id={`${prefix}-washing`}
                          label="Washing ₹ / Pc"
                          name="washing"
                        />
                        <NumberField
                          defaultValue={task.product.checking}
                          id={`${prefix}-checking`}
                          label="Checking ₹ / Pc"
                          name="checking"
                        />
                        <NumberField
                          defaultValue={task.product.marking}
                          id={`${prefix}-marking`}
                          label="Marking ₹ / Pc"
                          name="marking"
                        />
                        <NumberField
                          defaultValue={task.product.plating}
                          id={`${prefix}-plating`}
                          label="Plating ₹ / Pc"
                          name="plating"
                        />
                        <NumberField
                          defaultValue={task.product.annealing}
                          id={`${prefix}-annealing`}
                          label="Annealing ₹ / Pc"
                          name="annealing"
                        />
                        <NumberField
                          defaultValue={task.product.buffing}
                          id={`${prefix}-buffing`}
                          label="Buffing ₹ / Pc"
                          name="buffing"
                        />
                        <NumberField
                          defaultValue={task.product.deburring}
                          id={`${prefix}-deburring`}
                          label="Deburring ₹ / Pc"
                          name="deburring"
                        />
                        <NumberField
                          defaultValue={task.product.sealant}
                          id={`${prefix}-sealant`}
                          label="Sealant ₹ / Pc"
                          name="sealant"
                        />
                        <NumberField
                          defaultValue={task.product.assemblyOperationCost}
                          id={`${prefix}-assembly`}
                          label="Assembly Operation ₹ / Kg"
                          name="assembly_operation_cost"
                        />
                        <NumberField
                          defaultValue={task.product.overheadCost}
                          id={`${prefix}-overhead`}
                          label="Overhead ₹ / Pc"
                          name="overhead_cost"
                        />
                        <NumberField
                          defaultValue={percent(
                            task.product.burningLossPercent
                          )}
                          id={`${prefix}-burning`}
                          label="Burning Loss (%)"
                          name="burning_loss_percent"
                        />
                        <NumberField
                          defaultValue={percent(task.product.rejectionPercent)}
                          id={`${prefix}-rejection`}
                          label="Rejection (%)"
                          name="rejection_percent"
                        />
                      </div>
                      <Field>
                        <FieldLabel htmlFor={`${prefix}-remarks`}>
                          Costing Remarks
                        </FieldLabel>
                        <Textarea id={`${prefix}-remarks`} name="remarks" />
                      </Field>
                      <div className="flex flex-wrap gap-2">
                        <Button name="action" type="submit" value="in_progress">
                          Save Parameters
                        </Button>
                        <Button
                          name="action"
                          type="submit"
                          value="complete"
                          variant="secondary"
                        >
                          Complete Product Costing
                        </Button>
                      </div>
                    </FieldGroup>
                  </FieldSet>
                </form>

                <Separator />

                {quoteReady ? (
                  <form action={saveQuoteAction}>
                    <input
                      name="enquiry_item_id"
                      type="hidden"
                      value={task.enquiryItemId}
                    />
                    <input name="item_id" type="hidden" value={task.itemId} />
                    <FieldSet>
                      <FieldLegend>Customer Quote Parameters</FieldLegend>
                      <FieldGroup>
                        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                          <Field>
                            <FieldLabel htmlFor={`${prefix}-customer-part`}>
                              Customer Part Code
                            </FieldLabel>
                            <Input
                              defaultValue={task.customerPartCode ?? ""}
                              id={`${prefix}-customer-part`}
                              name="customer_part_code"
                            />
                          </Field>
                          <NumberField
                            defaultValue={task.quantity}
                            id={`${prefix}-quantity`}
                            label="Quantity"
                            name="quantity"
                          />
                          <NumberField
                            defaultValue={task.conversionRate}
                            id={`${prefix}-conversion`}
                            label="₹ Per Usd"
                            name="conversion_rate"
                          />
                          <NumberField
                            defaultValue={0}
                            id={`${prefix}-scrap`}
                            label="Scrap ₹ / Kg"
                            name="scrap_rate"
                          />
                          <NumberField
                            defaultValue={1}
                            id={`${prefix}-purchase-times`}
                            label="Purchase Multiplier"
                            name="purchase_times"
                          />
                          <NumberField
                            defaultValue={0}
                            id={`${prefix}-profit`}
                            label="Profit (%)"
                            name="profit_percent"
                          />
                          <NumberField
                            defaultValue={task.product.overheadCost}
                            id={`${prefix}-quote-overhead`}
                            label="Quote Overhead ₹ / Pc"
                            name="quote_overhead_cost"
                          />
                          <NumberField
                            defaultValue={0}
                            id={`${prefix}-packing`}
                            label="Packing ₹ / Kg"
                            name="packing_cost"
                          />
                          <NumberField
                            defaultValue={0}
                            id={`${prefix}-shipping`}
                            label="Shipping ₹ / Kg"
                            name="shipping_cost"
                          />
                          <Field>
                            <FieldLabel htmlFor={`${prefix}-packaging`}>
                              Packaging
                            </FieldLabel>
                            <Input
                              id={`${prefix}-packaging`}
                              name="packaging"
                            />
                          </Field>
                          <Field>
                            <FieldLabel htmlFor={`${prefix}-shipping-terms`}>
                              Shipping Terms
                            </FieldLabel>
                            <Input
                              id={`${prefix}-shipping-terms`}
                              name="shipping_terms"
                            />
                          </Field>
                        </div>

                        {leafItems.length ? (
                          <div className="grid gap-4 rounded-2xl border p-4">
                            <div>
                              <h3 className="text-sm font-medium">
                                Component Quote Inputs
                              </h3>
                              <p className="text-sm text-muted-foreground">
                                Applied To Each Leaf Product Without Flattening
                                Package Snapshots.
                              </p>
                            </div>
                            {leafItems.map((item) => (
                              <div
                                className="grid gap-3 sm:grid-cols-4"
                                key={item.itemId}
                              >
                                <input
                                  name="child_item_id"
                                  type="hidden"
                                  value={item.itemId}
                                />
                                <div className="flex items-end pb-2 text-sm font-medium">
                                  {item.uid}
                                </div>
                                <NumberField
                                  defaultValue={0}
                                  id={`${prefix}-${item.itemId}-scrap`}
                                  label="Scrap ₹ / Kg"
                                  name="child_scrap_rate"
                                />
                                <NumberField
                                  defaultValue={1}
                                  id={`${prefix}-${item.itemId}-purchase`}
                                  label="Purchase Multiplier"
                                  name="child_purchase_times"
                                />
                                <NumberField
                                  defaultValue={0}
                                  id={`${prefix}-${item.itemId}-profit`}
                                  label="Profit (%)"
                                  name="child_profit_percent"
                                />
                              </div>
                            ))}
                          </div>
                        ) : null}

                        {assemblyItems.length ? (
                          <div className="grid gap-4 rounded-2xl border p-4">
                            <div>
                              <h3 className="text-sm font-medium">
                                Nested Assembly Profit
                              </h3>
                              <p className="text-sm text-muted-foreground">
                                Profit Applies Only To Each Assembly&apos;s Own
                                Process Cost.
                              </p>
                            </div>
                            {assemblyItems.map((item) => (
                              <div
                                className="grid gap-3 sm:grid-cols-2"
                                key={item.itemId}
                              >
                                <input
                                  name="assembly_item_id"
                                  type="hidden"
                                  value={item.itemId}
                                />
                                <div className="flex items-end pb-2 text-sm font-medium">
                                  {item.uid}
                                </div>
                                <NumberField
                                  defaultValue={0}
                                  id={`${prefix}-${item.itemId}-assembly-profit`}
                                  label="Assembly Profit (%)"
                                  name="assembly_profit_percent"
                                />
                              </div>
                            ))}
                          </div>
                        ) : null}

                        <Button type="submit">Save Draft Quote</Button>
                      </FieldGroup>
                    </FieldSet>
                  </form>
                ) : (
                  <div className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">
                    Complete Product Costing Before Entering Customer Quote
                    Parameters.
                  </div>
                )}
                {task.nextStageStatus === "Started" ? (
                  <form action={sendQuoteBackToProductCostingAction}>
                    <input
                      name="enquiry_id"
                      type="hidden"
                      value={task.enquiryId}
                    />
                    <input name="item_id" type="hidden" value={task.itemId} />
                    <Button type="submit" variant="outline">
                      Return Unsent Quote To Product Costing
                    </Button>
                  </form>
                ) : null}
              </CardContent>
            </Card>
          )
        })
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>No Costing Tasks</CardTitle>
            <CardDescription>
              Complete An Enquiry&apos;s Technical And Design Stages To Prepare
              It For Product Costing.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <Separator />
      <div>
        <h2 className="text-lg font-semibold tracking-tight">
          Calculation Workbook
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Use The Same Recovered Pricing Formula Independently For Checks And
          What-If Calculations.
        </p>
        <CostingCalculator />
      </div>
    </div>
  )
}
