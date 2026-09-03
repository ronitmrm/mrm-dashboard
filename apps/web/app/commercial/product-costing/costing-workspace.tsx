import Link from "next/link"

import { createCommercialCostingRepository } from "@workspace/db"
import {
  calculateBomPieceWeight,
  type BomPieceWeightComponent,
} from "@workspace/db/pricing-calculation"
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
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field"
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
import { productCostingTaskHref } from "@/lib/pricing/costing-task-routes"

import { requestProductCostingDesignClarificationAction } from "../costing/actions"
import { ProductCostingForm } from "./product-costing-form"

export const dynamic = "force-dynamic"

function taskAction(taskType: string) {
  if (taskType === "Product Parameter Bulk Revision")
    return "Open Bulk Revision"
  if (taskType === "ECN Product Parameter Costing") return "Open ECN Costing"
  return "Open Product Cost"
}

export async function ProductParameterCostingView({
  searchParams,
  standalone = false,
}: {
  searchParams: Promise<{ item?: string; task?: string }>
  standalone?: boolean
}) {
  await requireCapability(
    commercialCapabilities.costing.read,
    "/commercial/product-costing"
  )
  const params = await searchParams
  const selectedTaskId = params.task?.trim() ?? ""
  const selectedItemId = params.item?.trim() ?? ""
  const repository = createCommercialCostingRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const data = await (async () => {
    try {
      const [queue, summary, reference, selectedTasks, requestedProduct] =
        await Promise.all([
          repository.listProductCostingTasksBounded("MRMPL"),
          repository.getProductCostingTaskSummary("MRMPL"),
          repository.listProductCostingReferenceData("MRMPL"),
          selectedTaskId
            ? repository.listCostingTasks("MRMPL", {
                enquiryItemId: selectedTaskId,
                limit: 1,
              })
            : Promise.resolve([]),
          selectedItemId
            ? repository.getProductCostingProduct("MRMPL", selectedItemId)
            : Promise.resolve(null),
        ])
      const selectedTask = selectedTasks.find(
        (task) => task.nextStageStatus === "Product Costing"
      )
      const allowedItemIds = new Set(
        selectedTask
          ? [
              selectedTask.itemId,
              ...selectedTask.bomItems.map((item) => item.itemId),
            ]
          : []
      )
      const selectedProduct =
        requestedProduct && allowedItemIds.has(requestedProduct.id)
          ? requestedProduct
          : null
      return { queue, reference, selectedProduct, selectedTask, summary }
    } finally {
      await repository.close()
    }
  })()
  const { queue, reference, selectedProduct, selectedTask, summary } = data
  const bomItems = selectedTask?.bomItems ?? []
  const weightComponentsFor = (
    parentItemId: string,
    ancestors = new Set<string>()
  ): BomPieceWeightComponent[] => {
    if (ancestors.has(parentItemId)) return []
    const nextAncestors = new Set(ancestors)
    nextAncestors.add(parentItemId)
    return bomItems
      .filter((item) => item.parentItemId === parentItemId)
      .map((item) => {
        const components = ["Package", "Assembly"].includes(item.itemType)
          ? weightComponentsFor(item.itemId, nextAncestors)
          : []
        return {
          components,
          pieceWeightGrams: item.weight100Pcs,
          quantity: item.lineQuantity,
        }
      })
  }
  const calculatedPieceWeight = selectedProduct
    ? calculateBomPieceWeight(weightComponentsFor(selectedProduct.id))
    : 0
  const costingProduct =
    selectedProduct &&
    ["Package", "Assembly"].includes(selectedProduct.itemType) &&
    calculatedPieceWeight > 0
      ? {
          ...selectedProduct,
          piecesPerKg: 1000 / calculatedPieceWeight,
          weight100Pcs: calculatedPieceWeight,
        }
      : selectedProduct

  return (
    <div className="grid gap-6">
      {!standalone ? (
        <>
          <section className="grid gap-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-2xl font-semibold tracking-tight">
                Product Parameter Costing
              </h2>
              <Button asChild variant="outline">
                <Link href="/commercial/pricing">Product Pricing</Link>
              </Button>
            </div>
            <BoundedResultNotice
              coverage={queue.coverage}
              section="Product Parameter Costing queue"
            />
          </section>

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard tone="information"
              label="New Product Costing"
              value={summary.newProductCosting}
            />
            <MetricCard tone="accent"
              label="Product Bulk Revision"
              value={summary.productBulkRevisions}
            />
            <MetricCard tone="warning" label="ECN Product Change" value={summary.ecn} />
            <MetricCard tone="brand" label="Total Costing Tasks" value={summary.total} />
          </section>

 <SectionCard>
            <CardHeader>
              <CardTitle>Product Parameter Costing Queue</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-h-[60vh] overflow-auto rounded-md border">
 <OperationalTable
                  containerClassName="max-h-none overflow-visible"
                  excelFilters
                >
                  <TableHeader className="sticky top-0 z-10 bg-background">
                    <TableRow>
                      <TableHead data-filterable="true">Task Type</TableHead>
                      <TableHead data-filterable="true">Reference</TableHead>
                      <TableHead data-filterable="true">Customer</TableHead>
                      <TableHead data-filterable="true">
                        Part / Product
                      </TableHead>
                      <TableHead data-filterable="true">Description</TableHead>
                      <TableHead data-filterable="true">Detail</TableHead>
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
                        <TableCell className="font-mono">
                          {task.reference}
                        </TableCell>
                        <TableCell>{task.companyName ?? "—"}</TableCell>
                        <TableCell className="font-mono">{task.uid}</TableCell>
                        <TableCell className="max-w-80 whitespace-normal">
                          {task.description}
                        </TableCell>
                        <TableCell>{task.detail}</TableCell>
                        <TableCell data-filter-value={task.nextStageStatus}>
                          <Badge variant="secondary">
                            {task.nextStageStatus}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button asChild size="sm" variant="outline">
                            <Link href={productCostingTaskHref(task)}>
                              {taskAction(task.taskType)}
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {!queue.rows.length ? (
                      <TableRow>
                        <TableCell className="h-24 text-center" colSpan={8}>
                          No Design-Complete Products Are Waiting For Costing.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
 </OperationalTable>
              </div>
            </CardContent>
 </SectionCard>
        </>
      ) : null}

      {standalone ? (
 <SectionCard id="product-cost-form">
          <CardHeader>
            <CardTitle>Product Cost Parameters</CardTitle>
            <CardDescription>
              One Product Is Opened At A Time. Design Fields Stay Locked; Only
              Design-Selected Processes Can Be Costed.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6">
            {selectedTask && costingProduct ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">
                      {selectedTask.enquiryNumber}
                    </Badge>
                    <Badge variant="secondary">
                      {selectedTask.companyName}
                    </Badge>
                    <Badge>{selectedTask.nextStageStatus}</Badge>
                  </div>
                  <Button asChild size="sm" variant="ghost">
                    <Link href="/commercial/product-costing">
                      Back To Queue
                    </Link>
                  </Button>
                </div>
                <ProductCostingForm
                  bomParts={selectedTask.bomItems}
                  key={costingProduct.id}
                  machineTypes={reference.machineTypes}
                  product={costingProduct}
                  rootItemId={selectedTask.itemId}
                  taskId={selectedTask.enquiryItemId}
                />
                <form
                  action={requestProductCostingDesignClarificationAction}
                  className="grid gap-4 rounded-2xl border border-dashed p-4"
                >
                  <input
                    name="enquiry_item_id"
                    type="hidden"
                    value={selectedTask.enquiryItemId}
                  />
                  <FieldGroup>
                    <Field>
                      <FieldLabel>Message For Design</FieldLabel>
                      <Textarea name="message" required />
                    </Field>
                    <Button className="w-fit" type="submit" variant="outline">
                      Send Back To Design
                    </Button>
                  </FieldGroup>
                </form>
              </>
            ) : selectedTaskId ? (
              <p className="text-sm text-muted-foreground">
                This Product Costing Task Or Selected BOM Part Is Not Available.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Open A Product Parameter Costing Task From The Queue.
              </p>
            )}
          </CardContent>
 </SectionCard>
      ) : null}
    </div>
  )
}
