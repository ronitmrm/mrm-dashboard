import Link from "next/link"

import { createCommercialWorkflowRepository } from "@workspace/db"
import { designTaskIsEditable } from "@workspace/db/commercial-design-domain"
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
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { Separator } from "@workspace/ui/components/separator"
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
import { requireCapability } from "@/lib/auth/require-capability"
import { technicalReviewChecklist } from "@/lib/pricing/technical-review"

import {
  prepareCostingAction,
  requestDesignClarificationAction,
  saveDesignAction,
} from "../enquiries/actions"
import { DesignTaskEditor } from "./design-task-editor"

export const dynamic = "force-dynamic"

function display(value: number | string | null | undefined) {
  return value === null || value === undefined || value === "" ? "—" : value
}

export default async function DesignPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; item?: string; product?: string }>
}) {
  await requireCapability("pricing.design.read", "/commercial/design")
  const params = await searchParams
  const productSearch = params.product?.trim() ?? ""
  const selectedItemId = params.item?.trim() ?? ""
  const openedFromExcel = params.from === "excel"
  const workflow = createCommercialWorkflowRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const data = await (async () => {
    try {
      const [designResult, summary] = await Promise.all([
        workflow.listDesignQueueBounded("MRMPL"),
        workflow.getDesignQueueSummary("MRMPL"),
      ])
      let selectedItem = selectedItemId
        ? designResult.rows.find(
            (item) => item.enquiryItemId === selectedItemId
          )
        : designResult.rows[0]
      if (!selectedItem && openedFromExcel && selectedItemId) {
        selectedItem =
          (await workflow.getDesignTask("MRMPL", selectedItemId)) ?? undefined
      }
      const editable = selectedItem
        ? designTaskIsEditable({
            designStatus: selectedItem.designStatus,
            nextStageStatus: selectedItem.nextStageStatus,
          })
        : false
      const productOptions = editable
        ? await workflow.searchDesignPortfolioProducts("MRMPL", productSearch)
        : {
            coverage: { limit: 50, returned: 0, truncated: false },
            rows: [],
          }
      return { designResult, editable, productOptions, selectedItem, summary }
    } finally {
      await workflow.close()
    }
  })()
  const { designResult, editable, productOptions, selectedItem, summary } = data

  return (
    <div className="grid gap-6">
      <section className="grid gap-2">
        <h2 className="text-2xl font-semibold tracking-tight">Design Tasks</h2>
        <p className="max-w-4xl text-sm text-muted-foreground">
          Review technically feasible lines, match ordered portfolio products,
          or create controlled Q/C designs with nested package BOMs.
        </p>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <MetricCard label="Pending Design" value={summary.pendingDesign} />
        <MetricCard label="In Progress" value={summary.inProgress} />
        <MetricCard label="Open Design Tasks" value={summary.openTasks} />
      </section>

      <BoundedResultNotice
        actionHref="/commercial/enquiries/excel-view"
        actionLabel="Review the enquiry Excel view"
        coverage={designResult.coverage}
        section="Active Design queue"
      />

      <Card>
        <CardHeader>
          <CardTitle>Active Design Queue</CardTitle>
          <CardDescription>
            Completed and not-required tasks stay out of this bounded working
            set and remain available from the enquiry Excel view.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <Table
              excelFilters
              filterStorageKey="mrmpl:commercial:design-queue:filters:v1"
            >
              <TableHeader>
                <TableRow>
                  <TableHead>ENQ</TableHead>
                  <TableHead>Line</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Part</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Technical</TableHead>
                  <TableHead>Design</TableHead>
                  <TableHead>Portfolio</TableHead>
                  <TableHead>Designer</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {designResult.rows.length ? (
                  designResult.rows.map((item) => (
                    <TableRow key={item.enquiryItemId}>
                      <TableCell>
                        <Link
                          className="font-medium underline-offset-4 hover:underline"
                          href={{
                            pathname: "/commercial/design",
                            query: { item: item.enquiryItemId },
                          }}
                        >
                          {item.enquiryNumber}
                        </Link>
                      </TableCell>
                      <TableCell>{item.lineNumber}</TableCell>
                      <TableCell>
                        {item.customerUid} · {item.companyName}
                      </TableCell>
                      <TableCell>{item.customerPartCode}</TableCell>
                      <TableCell>{item.description}</TableCell>
                      <TableCell>{item.technicalReviewStatus}</TableCell>
                      <TableCell>{item.designStatus}</TableCell>
                      <TableCell>{item.portfolioMatchStatus}</TableCell>
                      <TableCell>{display(item.designerName)}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      className="py-10 text-center text-muted-foreground"
                      colSpan={9}
                    >
                      No active Design tasks.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {selectedItem ? (
        <Card id="design-form">
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle>
                  {selectedItem.enquiryNumber} / Line {selectedItem.lineNumber}
                </CardTitle>
                <CardDescription>
                  {selectedItem.customerUid} · {selectedItem.companyName} ·{" "}
                  {selectedItem.customerPartCode} · {selectedItem.description}
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{selectedItem.designStatus}</Badge>
                <Badge variant="outline">{selectedItem.nextStageStatus}</Badge>
                <Button asChild size="sm" variant="ghost">
                  <Link
                    href={`/commercial/enquiries/${selectedItem.enquiryId}`}
                  >
                    Open Enquiry
                  </Link>
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid gap-6">
            {!editable ? (
              <p className="rounded-2xl border bg-muted/40 p-3 text-sm">
                This completed Design task is read-only because Product Costing
                has already started.
              </p>
            ) : null}
            {selectedItem.latestClarificationMessage ? (
              <p className="rounded-2xl border bg-muted/40 p-3 text-sm">
                {selectedItem.latestClarificationSource ?? "Product Costing"}:{" "}
                {selectedItem.latestClarificationMessage}
              </p>
            ) : null}

            <section className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border p-4">
                <h3 className="font-medium">Logged Enquiry</h3>
                <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                  {[
                    ["Quantity", selectedItem.quantity],
                    ["Grade", selectedItem.grade],
                    ["Target Price", selectedItem.targetPrice],
                    ["Drawing Reference", selectedItem.drawingReference],
                    ["Delivery Terms", selectedItem.deliveryTerms],
                    ["Payment Terms", selectedItem.paymentTerms],
                    ["Line Remarks", selectedItem.lineRemarks],
                    ["Enquiry Remarks", selectedItem.enquiryRemarks],
                  ].map(([label, value]) => (
                    <div className="contents" key={label}>
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd>{display(value)}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              <div className="rounded-2xl border p-4">
                <h3 className="font-medium">Technical Review</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {selectedItem.technicalReviewStatus} ·{" "}
                  {display(selectedItem.technicalRemarks)}
                </p>
                {selectedItem.feasibilityReason ? (
                  <p className="mt-2 text-sm">
                    Feasibility: {selectedItem.feasibilityReason}
                  </p>
                ) : null}
                {selectedItem.missingInformation ? (
                  <p className="mt-2 text-sm">
                    Missing information: {selectedItem.missingInformation}
                  </p>
                ) : null}
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {technicalReviewChecklist.map(([key, label]) => (
                    <p className="text-sm" key={key}>
                      <span className="text-muted-foreground">{label}:</span>{" "}
                      {selectedItem.technicalChecklist[key] ? "Yes" : "No"}
                    </p>
                  ))}
                </div>
                {selectedItem.customerDrawingFileName ? (
                  <Button asChild className="mt-4" size="sm" variant="outline">
                    <Link
                      href={`/commercial/enquiry-items/${selectedItem.enquiryItemId}/drawing`}
                    >
                      Open Customer Drawing
                    </Link>
                  </Button>
                ) : null}
              </div>
            </section>

            {editable ? (
              <form
                className="flex flex-col gap-2 sm:flex-row sm:items-end"
                id="design-product-search"
              >
                <input
                  name="item"
                  type="hidden"
                  value={selectedItem.enquiryItemId}
                />
                {openedFromExcel ? (
                  <input name="from" type="hidden" value="excel" />
                ) : null}
                <Field className="max-w-md flex-1">
                  <FieldLabel htmlFor="design-product-query">
                    Find Ordered Portfolio Product
                  </FieldLabel>
                  <Input
                    defaultValue={productSearch}
                    id="design-product-query"
                    name="product"
                    placeholder="Product UID or description"
                  />
                </Field>
                <Button type="submit" variant="outline">
                  Search
                </Button>
              </form>
            ) : null}
            <BoundedResultNotice
              actionHref="#design-product-search"
              actionLabel="Refine product search"
              coverage={productOptions.coverage}
              searchQuery={productSearch}
              section="Portfolio product options"
            />

            <form action={saveDesignAction}>
              <input
                name="enquiry_id"
                type="hidden"
                value={selectedItem.enquiryId}
              />
              <input
                name="enquiry_item_id"
                type="hidden"
                value={selectedItem.enquiryItemId}
              />
              <input
                name="organization_id"
                type="hidden"
                value={selectedItem.organizationId}
              />
              <DesignTaskEditor
                editable={editable}
                initial={{
                  bomLines: selectedItem.bomLines,
                  checkedBy: selectedItem.checkedBy,
                  componentsRequired: selectedItem.componentsRequired,
                  designBomCompleted: selectedItem.designBomCompleted,
                  designRemarks: selectedItem.designRemarks,
                  designerName: selectedItem.designerName,
                  fixtureApproxCost: selectedItem.fixtureApproxCost,
                  fixtureRequired: selectedItem.fixtureRequired,
                  gaugesRequired: selectedItem.gaugesRequired,
                  inspectionApproxCost: selectedItem.inspectionApproxCost,
                  internalPartCategory: selectedItem.internalPartCategory,
                  internalPartSize: selectedItem.internalPartSize,
                  internalPartSubCategory: selectedItem.internalPartSubCategory,
                  itemType: selectedItem.itemType,
                  manufacturingProcess: selectedItem.manufacturingProcess,
                  matchedProductId: selectedItem.matchedProductId,
                  operationNotes: selectedItem.operationNotes,
                  packageProcessRequired: selectedItem.packageProcessRequired,
                  portfolioMatchStatus: selectedItem.portfolioMatchStatus,
                  quotedPartUid: selectedItem.quotedPartUid,
                  targetCompletionDate: selectedItem.targetCompletionDate,
                  toolingApproxCost: selectedItem.toolingApproxCost,
                  toolingRequired: selectedItem.toolingRequired,
                }}
                products={productOptions.rows}
              />
            </form>

            {selectedItem.attachments.length ? (
              <div className="flex flex-wrap gap-2">
                {selectedItem.attachments.map((attachment) => (
                  <Button
                    asChild
                    key={attachment.id}
                    size="sm"
                    variant="outline"
                  >
                    <Link
                      href={`/commercial/design/${selectedItem.designId}/file/${attachment.purpose}`}
                    >
                      {attachment.purpose}: {attachment.fileName}
                    </Link>
                  </Button>
                ))}
              </div>
            ) : null}

            <Separator />
            <div className="grid gap-4 lg:grid-cols-2">
              <form action={requestDesignClarificationAction}>
                <input
                  name="enquiry_id"
                  type="hidden"
                  value={selectedItem.enquiryId}
                />
                <input
                  name="enquiry_item_id"
                  type="hidden"
                  value={selectedItem.enquiryItemId}
                />
                <input
                  name="direction"
                  type="hidden"
                  value="Design to Technical"
                />
                <FieldGroup>
                  <Field>
                    <FieldLabel>
                      Ask Technical For Clarification
                      <Textarea name="message" required />
                    </FieldLabel>
                  </Field>
                  <Button className="w-fit" type="submit" variant="outline">
                    Send To Technical
                  </Button>
                </FieldGroup>
              </form>
              {["Design Complete", "Not Required"].includes(
                selectedItem.designStatus
              ) &&
              ["Not Started", "Changes Required"].includes(
                selectedItem.nextStageStatus
              ) ? (
                <form action={prepareCostingAction}>
                  <input
                    name="enquiry_id"
                    type="hidden"
                    value={selectedItem.enquiryId}
                  />
                  <input
                    name="enquiry_item_id"
                    type="hidden"
                    value={selectedItem.enquiryItemId}
                  />
                  <FieldGroup>
                    <p className="text-sm text-muted-foreground">
                      Create or update the controlled product and hand this line
                      to Product Costing.
                    </p>
                    <Button className="w-fit" type="submit">
                      Prepare Product Costing
                    </Button>
                  </FieldGroup>
                </form>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
