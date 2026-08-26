import Link from "next/link"
import { notFound, redirect } from "next/navigation"

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
} from "@workspace/ui/components/card"
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { Separator } from "@workspace/ui/components/separator"
import { Textarea } from "@workspace/ui/components/textarea"

import { BoundedResultNotice } from "@/components/bounded-result-notice"
import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"
import { technicalReviewChecklist } from "@/lib/pricing/technical-review"

import {
  prepareCostingAction,
  requestDesignClarificationAction,
  saveDesignAction,
} from "../../../enquiries/actions"
import { DesignTaskEditor } from "../../design-task-editor"

export const dynamic = "force-dynamic"

function display(value: number | string | null | undefined) {
  return value === null || value === undefined || value === "" ? "—" : value
}

export default async function NewDesignWorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ product?: string }>
}) {
  const { id } = await params
  await requireCapability("pricing.design.read", `/commercial/design/${id}/new`)
  const productSearch = (await searchParams).product?.trim() ?? ""
  const workflow = createCommercialWorkflowRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const data = await (async () => {
    try {
      const selectedItem = await workflow.getDesignTask("MRMPL", id)
      if (!selectedItem) return null
      const editable = designTaskIsEditable({
        designStatus: selectedItem.designStatus,
        nextStageStatus: selectedItem.nextStageStatus,
      })
      const productOptions = editable
        ? await workflow.searchDesignPortfolioProducts("MRMPL", productSearch)
        : {
            coverage: { limit: 50, returned: 0, truncated: false },
            rows: [],
          }
      return { editable, productOptions, selectedItem }
    } finally {
      await workflow.close()
    }
  })()
  if (!data) notFound()
  if (data.selectedItem.portfolioMatchStatus !== "New Quoted Part") {
    redirect(`/commercial/design/${id}`)
  }
  const { editable, productOptions, selectedItem } = data

  return (
    <div className="grid gap-6">
      <section className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-2">
          <Button asChild className="w-fit" size="sm" variant="ghost">
            <Link href="/commercial/design">Back To Design Queue</Link>
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-semibold tracking-tight">
              {selectedItem.enquiryNumber} / Line {selectedItem.lineNumber}
            </h2>
            <Badge variant="secondary">{selectedItem.designStatus}</Badge>
            <Badge variant="outline">{selectedItem.nextStageStatus}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {selectedItem.customerUid} · {selectedItem.companyName} ·{" "}
            {display(selectedItem.customerPartCode)} ·{" "}
            {selectedItem.description}
          </p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href={`/commercial/enquiries/${selectedItem.enquiryId}`}>
            Open Enquiry
          </Link>
        </Button>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>New Product Design Workspace</CardTitle>
          <CardDescription>
            Save incomplete work to keep the line In Progress. Mark the BOM
            complete only when the Design work is finished.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          {!editable ? (
            <p className="rounded-2xl border bg-muted/40 p-3 text-sm">
              This Design task is read-only because its downstream work has
              already started.
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
              <h3 className="font-medium">Technical Release</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {selectedItem.technicalReviewStatus} ·{" "}
                {display(selectedItem.technicalRemarks)}
              </p>
              {selectedItem.feasibilityReason ? (
                <p className="mt-2 text-sm">
                  Feasibility: {selectedItem.feasibilityReason}
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
              <Field className="max-w-md flex-1">
                <FieldLabel htmlFor="design-product-query">
                  Find Existing BOM Component
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
            section="BOM component options"
          />

          <form action={saveDesignAction}>
            <input
              name="design_id"
              type="hidden"
              value={selectedItem.designId ?? ""}
            />
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
              portfolioDecisionLocked
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
                <Button asChild key={attachment.id} size="sm" variant="outline">
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
    </div>
  )
}
