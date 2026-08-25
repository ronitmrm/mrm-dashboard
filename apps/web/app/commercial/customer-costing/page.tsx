import Link from "next/link"

import { createCommercialCostingRepository } from "@workspace/db"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle, MetricCard,
} from "@workspace/ui/components/card"
import {
  Field, FieldGroup, FieldLabel, FieldLegend, FieldSet,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@workspace/ui/components/table"

import {
  saveQuoteAction,
  sendQuoteBackToProductCostingAction,
} from "@/app/commercial/costing/actions"
import { BoundedResultNotice } from "@/components/bounded-result-notice"
import { readAuthEnvironment } from "@/lib/auth/auth"
import { commercialCapabilities } from "@/lib/auth/commercial-capabilities"
import { requireCapability } from "@/lib/auth/require-capability"

import { PoProfitTargetCalculator } from "./po-profit-target-calculator"

export const dynamic = "force-dynamic"

const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 4,
    minimumFractionDigits: 2,
  }).format(value)

const percent = (value: number) => Number((value * 100).toFixed(6))

function NumberField({
  defaultValue,
  label,
  name,
}: {
  defaultValue: number
  label: string
  name: string
}) {
  return (
    <Field>
      <FieldLabel htmlFor={name}>{label}</FieldLabel>
      <Input
        defaultValue={defaultValue}
        id={name}
        min="0"
        name={name}
        step="0.0001"
        type="number"
      />
    </Field>
  )
}

function taskHref(task: {
  enquiryItemId: string | null
  quoteRevisionRequestId: string | null
  taskId: string
  taskType: string
}) {
  if (task.taskType === "Bulk Price Revision") {
    return `/commercial/customer-bulk-revision?revision=${encodeURIComponent(task.taskId)}#customer-bulk-workbench`
  }
  if (task.taskType === "ECN Price Review") {
    return `/commercial/ecns?ecn=${encodeURIComponent(task.taskId)}#ecn-workbench`
  }
  if (task.enquiryItemId) {
    const query = new URLSearchParams({ task: task.enquiryItemId })
    if (task.quoteRevisionRequestId) {
      query.set("poRevision", task.quoteRevisionRequestId)
    }
    return `/commercial/customer-costing?${query.toString()}#customer-cost-form`
  }
  return "/commercial/orders"
}

function actionLabel(taskType: string) {
  if (taskType === "Bulk Price Revision") return "Open Bulk Revision"
  if (taskType === "ECN Price Review") return "Open ECN Review"
  if (taskType === "PO Price Match") return "Match PO Price"
  return "Open Customer Cost"
}

export default async function CustomerParameterCostingPage({
  searchParams,
}: {
  searchParams: Promise<{ poRevision?: string; task?: string }>
}) {
  await requireCapability(
    commercialCapabilities.costing.read,
    "/commercial/customer-costing"
  )
  const params = await searchParams
  const selectedTaskId = params.task?.trim() ?? ""
  const repository = createCommercialCostingRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const data = await (async () => {
    try {
      const [queue, summary, selectedTasks] = await Promise.all([
        repository.listCustomerCostingTasksBounded("MRMPL"),
        repository.getCustomerCostingTaskSummary("MRMPL"),
        selectedTaskId
          ? repository.listCostingTasks("MRMPL", {
              enquiryItemId: selectedTaskId,
              limit: 1,
            })
          : Promise.resolve([]),
      ])
      return { queue, selectedTask: selectedTasks[0] ?? null, summary }
    } finally {
      await repository.close()
    }
  })()
  const { queue, selectedTask, summary } = data
  const selectedQueueTask = queue.rows.find(
    (task) =>
      task.enquiryItemId === selectedTaskId &&
      (!params.poRevision || task.quoteRevisionRequestId === params.poRevision)
  )
  const uniqueBomItems = selectedTask
    ? [
        ...new Map(
          selectedTask.bomItems.map((item) => [item.itemId, item])
        ).values(),
      ]
    : []
  const leafItems = uniqueBomItems.filter((item) => item.itemType === "List")
  const assemblyItems = uniqueBomItems.filter(
    (item) => item.itemType !== "List"
  )
  const isRootParent = selectedTask
    ? ["Package", "Assembly"].includes(selectedTask.itemType)
    : false
  const isDirectPurchase =
    selectedTask?.product.pricingMethod === "Direct Purchase"
  const componentDefaults = new Map(
    (selectedTask?.componentQuoteDefaults ?? []).map((item) => [
      item.itemId,
      item,
    ])
  )

  return (
    <div className="grid gap-6">
      <section className="grid gap-2">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Customer Parameter Costing
            </h1>
          </div>
          <Button asChild variant="outline">
            <Link href="/commercial/quotes">View Quote Register</Link>
          </Button>
        </div>
        <BoundedResultNotice
          coverage={queue.coverage}
          section="Customer Parameter Costing queue"
        />
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="New Quote Costing" value={summary.newQuoteCosting} />
        <MetricCard label="PO Price Match" value={summary.poPriceMatch} />
        <MetricCard label="Bulk Price Revision" value={summary.bulkPriceRevision} />
        <MetricCard label="ECN Price Review" value={summary.ecnPriceReview} />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Customer Costing Queue</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-h-[60vh] overflow-auto rounded-md border">
            <Table containerClassName="max-h-none overflow-visible" excelFilters>
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  <TableHead data-filterable="true">Task Type</TableHead>
                  <TableHead data-filterable="true">Reference</TableHead>
                  <TableHead data-filterable="true">Customer</TableHead>
                  <TableHead data-filterable="true">Part / Product</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Detail</TableHead>
                  <TableHead data-filterable="true">Status</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {queue.rows.map((task) => (
                  <TableRow
                    className="[contain-intrinsic-size:auto_48px] [content-visibility:auto]"
                    key={`${task.taskType}-${task.taskId}`}
                  >
                    <TableCell>{task.taskType}</TableCell>
                    <TableCell className="font-mono">{task.reference}</TableCell>
                    <TableCell>{task.companyName ?? "—"}</TableCell>
                    <TableCell className="font-mono">{task.uid}</TableCell>
                    <TableCell className="max-w-80 whitespace-normal">
                      {task.description}
                    </TableCell>
                    <TableCell>{task.detail}</TableCell>
                    <TableCell><Badge variant="secondary">{task.status}</Badge></TableCell>
                    <TableCell>
                      <Button asChild size="sm" variant="outline">
                        <Link href={taskHref(task)}>{actionLabel(task.taskType)}</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!queue.rows.length ? (
                  <TableRow>
                    <TableCell className="h-24 text-center" colSpan={8}>
                      No Customer Prices Are Waiting For Costing.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card id="customer-cost-form">
        <CardHeader>
          <CardTitle>Customer Quote Parameters</CardTitle>
          <CardDescription>
            Only The Selected Enquiry And Its BOM Are Loaded. Save In Progress
            Keeps The Quote Editable; Complete Costing Locks It For Sales.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {selectedTask ? (
            <form action={saveQuoteAction} className="grid gap-6">
              <input name="enquiry_item_id" type="hidden" value={selectedTask.enquiryItemId} />
              <input name="item_id" type="hidden" value={selectedTask.itemId} />
              {params.poRevision ? (
                <input
                  name="quote_revision_request_id"
                  type="hidden"
                  value={params.poRevision}
                />
              ) : null}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{selectedTask.enquiryNumber}</Badge>
                  <Badge variant="secondary">{selectedTask.companyName}</Badge>
                  <Badge>{selectedTask.uid}</Badge>
                  {selectedTask.quoteDefaults.status ? (
                    <Badge variant="secondary">{selectedTask.quoteDefaults.status}</Badge>
                  ) : null}
                </div>
                <Button asChild size="sm" variant="ghost">
                  <Link href="/commercial/customer-costing#customer-cost-form">Close Form</Link>
                </Button>
              </div>

              {selectedQueueTask?.targetPrice !== null && selectedQueueTask?.targetPrice !== undefined ? (
                <PoProfitTargetCalculator
                  currency={selectedTask.currency}
                  product={{
                    alloyPremium: selectedTask.product.alloyPremium,
                    annealing: selectedTask.product.annealing,
                    assemblyOperationCost:
                      selectedTask.product.assemblyOperationCost,
                    buffing: selectedTask.product.buffing,
                    burningLossPercent:
                      selectedTask.product.burningLossPercent,
                    casting: selectedTask.product.casting,
                    checking: selectedTask.product.checking,
                    deburring: selectedTask.product.deburring,
                    directPurchasePricePerPiece:
                      selectedTask.product.directPurchasePricePerPiece,
                    extrusionCost: selectedTask.product.extrusionCost,
                    forgingCost: selectedTask.product.forgingCost,
                    itemType: selectedTask.itemType,
                    machiningCost: selectedTask.product.machiningCost,
                    marking: selectedTask.product.marking,
                    overheadCost: selectedTask.product.overheadCost,
                    plating: selectedTask.product.plating,
                    pricingMethod: selectedTask.product.pricingMethod,
                    productCostInr: selectedTask.product.productCostInr,
                    rejectionPercent: selectedTask.product.rejectionPercent,
                    sealant: selectedTask.product.sealant,
                    washing: selectedTask.product.washing,
                    weight100Pcs: selectedTask.product.weight100Pcs,
                  }}
                  targetPrice={selectedQueueTask.targetPrice}
                />
              ) : null}

              <FieldSet>
                <FieldLegend>Customer And Commercial Inputs</FieldLegend>
                <FieldGroup>
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <Field>
                      <FieldLabel htmlFor="customer_part_code">Customer Part Code</FieldLabel>
                      <Input
                        defaultValue={selectedTask.customerPartCode ?? ""}
                        id="customer_part_code"
                        name="customer_part_code"
                      />
                    </Field>
                    <NumberField defaultValue={selectedTask.quantity} label="Quantity" name="quantity" />
                    <NumberField defaultValue={selectedTask.quoteDefaults.conversionRate} label="INR Per USD" name="conversion_rate" />
                    <NumberField defaultValue={percent(selectedTask.quoteDefaults.profitPercent)} label="Profit (%)" name="profit_percent" />
                    {isRootParent || isDirectPurchase ? (
                      <>
                        <input name="scrap_rate" type="hidden" value="0" />
                        <input name="purchase_times" type="hidden" value="1" />
                      </>
                    ) : (
                      <>
                        <NumberField defaultValue={selectedTask.quoteDefaults.scrapRate} label="Scrap INR / Kg" name="scrap_rate" />
                        <NumberField defaultValue={selectedTask.quoteDefaults.purchaseTimes} label="OR / Purchase Times" name="purchase_times" />
                      </>
                    )}
                    <NumberField defaultValue={selectedTask.quoteDefaults.packingCost} label="Packing INR / Kg" name="packing_cost" />
                    <NumberField defaultValue={selectedTask.quoteDefaults.shippingCost} label="Shipping INR / Kg" name="shipping_cost" />
                    <Field>
                      <FieldLabel htmlFor="packaging">Packaging</FieldLabel>
                      <Input defaultValue={selectedTask.quoteDefaults.packaging ?? ""} id="packaging" name="packaging" />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="shipping_terms">Shipping Terms</FieldLabel>
                      <Input defaultValue={selectedTask.quoteDefaults.shippingTerms ?? ""} id="shipping_terms" name="shipping_terms" />
                    </Field>
                  </div>
                </FieldGroup>
              </FieldSet>

              {leafItems.length ? (
                <FieldSet>
                  <FieldLegend>Package Child Quote Inputs</FieldLegend>
                  <FieldGroup>
                    {leafItems.map((item) => (
                      <div className="grid gap-4 rounded-2xl border p-4 sm:grid-cols-4" key={item.itemId}>
                        <input name="child_item_id" type="hidden" value={item.itemId} />
                        <div className="grid content-center gap-1">
                          <span className="font-mono text-sm">{item.uid}</span>
                          <span className="text-xs text-muted-foreground">{item.description}</span>
                        </div>
                        {item.pricingMethod === "Direct Purchase" ? (
                          <>
                            <input name="child_scrap_rate" type="hidden" value="0" />
                            <input name="child_purchase_times" type="hidden" value="1" />
                            <div className="self-center text-sm text-muted-foreground sm:col-span-2">
                              Direct Purchase Uses The Stored Per-Piece Cost.
                            </div>
                          </>
                        ) : (
                          <>
                            <NumberField defaultValue={componentDefaults.get(item.itemId)?.scrapRate ?? 0} label="Scrap INR / Kg" name="child_scrap_rate" />
                            <NumberField defaultValue={componentDefaults.get(item.itemId)?.purchaseTimes ?? 1} label="Purchase Times" name="child_purchase_times" />
                          </>
                        )}
                        <NumberField defaultValue={percent(componentDefaults.get(item.itemId)?.profitPercent ?? 0)} label="Profit (%)" name="child_profit_percent" />
                      </div>
                    ))}
                  </FieldGroup>
                </FieldSet>
              ) : null}

              {assemblyItems.length ? (
                <FieldSet>
                  <FieldLegend>Nested Assembly Profit</FieldLegend>
                  <FieldGroup>
                    {assemblyItems.map((item) => (
                      <div className="grid gap-4 rounded-2xl border p-4 sm:grid-cols-2" key={item.itemId}>
                        <input name="assembly_item_id" type="hidden" value={item.itemId} />
                        <div className="grid content-center gap-1">
                          <span className="font-mono text-sm">{item.uid}</span>
                          <span className="text-xs text-muted-foreground">{item.description}</span>
                        </div>
                        <NumberField defaultValue={percent(componentDefaults.get(item.itemId)?.profitPercent ?? 0)} label="Process Profit (%)" name="assembly_profit_percent" />
                      </div>
                    ))}
                  </FieldGroup>
                </FieldSet>
              ) : null}

              {selectedTask.quoteDefaults.id ? (
                <div className="grid gap-3 sm:grid-cols-3">
                  <MetricCard label="Saved INR / Pc" value={`₹ ${money(selectedTask.quoteDefaults.rateInr)}`} />
                  <MetricCard label="Saved USD / Pc" value={`$ ${money(selectedTask.quoteDefaults.rateUsd)}`} />
                  <MetricCard label="Approved USD / Pc" value={`$ ${money(selectedTask.quoteDefaults.approvedPriceUsd)}`} />
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <Button name="action" type="submit" value="in_progress">
                  Calculate And Save In Progress
                </Button>
                <Button name="action" type="submit" value="complete" variant="secondary">
                  Calculate And Complete Costing
                </Button>
              </div>
            </form>
          ) : selectedTaskId ? (
            <p className="text-sm text-muted-foreground">
              This Task Is No Longer Available For Customer Costing.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Open One Customer Parameter Costing Task From The Queue.
            </p>
          )}

          {selectedTask ? (
            <form action={sendQuoteBackToProductCostingAction} className="mt-6 border-t pt-6">
              <input name="enquiry_id" type="hidden" value={selectedTask.enquiryId} />
              <input name="item_id" type="hidden" value={selectedTask.itemId} />
              <Button type="submit" variant="outline">Send Back To Product Costing</Button>
            </form>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
