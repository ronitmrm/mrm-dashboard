import { ChevronDown } from "lucide-react"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"

import { createCommercialWorkflowRepository } from "@workspace/db"
import {
  designTaskIsEditable,
  designWorkspaceSection,
} from "@workspace/db/commercial-design-domain"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent } from "@workspace/ui/components/card"
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field"
import { Separator } from "@workspace/ui/components/separator"
import { Textarea } from "@workspace/ui/components/textarea"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"
import { technicalReviewChecklist } from "@/lib/pricing/technical-review"

import {
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
  searchParams: Promise<{
    incomplete?: string
    product?: string
    saved?: string
    selectedLine?: string
    section?: string
  }>
}) {
  const { id } = await params
  await requireCapability("pricing.design.read", `/commercial/design/${id}/new`)
  const resolvedSearchParams = await searchParams
  const incompleteFields =
    resolvedSearchParams.incomplete?.split("|").filter(Boolean) ?? []
  const savedSection = designWorkspaceSection(resolvedSearchParams.section)
  const productSearch = resolvedSearchParams.product?.trim() ?? ""
  const selectedLine = Number(resolvedSearchParams.selectedLine)
  const portfolioSelection =
    productSearch && Number.isInteger(selectedLine) && selectedLine >= 0
      ? { lineIndex: selectedLine, productUid: productSearch }
      : undefined
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
      const [designOptions, productOptions] = await Promise.all([
        workflow.getDesignWorkspaceOptions("MRMPL"),
        editable
          ? workflow.searchDesignPortfolioProducts("MRMPL", productSearch)
          : Promise.resolve({
              coverage: { limit: 50, returned: 0, truncated: false },
              rows: [],
            }),
      ])
      return { designOptions, editable, productOptions, selectedItem }
    } finally {
      await workflow.close()
    }
  })()
  if (!data) notFound()
  if (data.selectedItem.portfolioMatchStatus !== "New Quoted Part") {
    redirect(`/commercial/design/${id}`)
  }
  const { designOptions, editable, productOptions, selectedItem } = data

  return (
    <div className="flex min-h-[calc(100svh-4rem)] flex-col gap-6">
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
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href={`/commercial/enquiries/${selectedItem.enquiryId}`}>
              Open Enquiry
            </Link>
          </Button>
        </div>
      </section>

      <Card className="flex-1 overflow-hidden">
        <CardContent className="flex h-full flex-col gap-6 p-4 lg:p-6">
          {incompleteFields.length ? (
            <Alert id="design-completion-remark" variant="destructive">
              <AlertTitle>Design task is not complete</AlertTitle>
              <AlertDescription>
                <p>
                  The draft was saved and remains in the Design queue. Complete
                  these required fields before it can move to Product Costing:
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {incompleteFields.map((field) => (
                    <li key={field}>{field}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          ) : resolvedSearchParams.saved === "1" ? (
            <Alert>
              <AlertDescription>
                Design task saved successfully.
              </AlertDescription>
            </Alert>
          ) : null}
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

          <details className="group rounded-xl border bg-muted/20">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 [&::-webkit-details-marker]:hidden">
              <div>
                <p className="font-medium">Source Details</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {selectedItem.quantity} pcs · {display(selectedItem.grade)} ·{" "}
                  {selectedItem.technicalReviewStatus}
                </p>
              </div>
              <span className="flex items-center gap-2 text-sm font-medium text-primary">
                View Enquiry & Technical Details
                <ChevronDown
                  aria-hidden="true"
                  className="size-4 transition-transform group-open:rotate-180"
                />
              </span>
            </summary>
            <section className="grid border-t bg-background lg:grid-cols-3">
              <div className="p-5 lg:border-r">
                <h3 className="text-sm font-semibold">Part Requirements</h3>
                <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                  {[
                    ["Quantity", selectedItem.quantity],
                    ["Grade", selectedItem.grade],
                    ["Target Price", selectedItem.targetPrice],
                    ["Drawing Reference", selectedItem.drawingReference],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                        {label}
                      </dt>
                      <dd className="mt-1 text-sm leading-5 font-medium">
                        {display(value)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
              <div className="border-t p-5 lg:border-t-0 lg:border-r">
                <h3 className="text-sm font-semibold">Commercial Terms</h3>
                <dl className="mt-4 grid gap-4">
                  {[
                    ["Delivery Terms", selectedItem.deliveryTerms],
                    ["Payment Terms", selectedItem.paymentTerms],
                    ["Line Remarks", selectedItem.lineRemarks],
                    ["Enquiry Remarks", selectedItem.enquiryRemarks],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                        {label}
                      </dt>
                      <dd className="mt-1 text-sm leading-5 font-medium">
                        {display(value)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
              <div className="border-t p-5 lg:border-t-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">Technical Release</h3>
                  <Badge variant="secondary">
                    {selectedItem.technicalReviewStatus}
                  </Badge>
                </div>
                <p className="mt-3 text-sm leading-5 text-muted-foreground">
                  {display(selectedItem.technicalRemarks)}
                </p>
                {selectedItem.feasibilityReason ? (
                  <div className="mt-4 rounded-md bg-muted/40 px-3 py-2">
                    <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      Feasibility
                    </p>
                    <p className="mt-1 text-sm font-medium">
                      {selectedItem.feasibilityReason}
                    </p>
                  </div>
                ) : null}
                <div className="mt-4 grid gap-2">
                  {technicalReviewChecklist.map(([key, label]) => (
                    <div
                      className="flex items-start justify-between gap-3 rounded-md bg-muted/40 px-3 py-2 text-sm"
                      key={key}
                    >
                      <span className="text-muted-foreground">{label}</span>
                      <span className="font-medium">
                        {selectedItem.technicalChecklist[key] ? "Yes" : "No"}
                      </span>
                    </div>
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
          </details>

          <form action={saveDesignAction}>
            <input
              name="customer_uid"
              type="hidden"
              value={selectedItem.customerUid}
            />
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
              designOptions={designOptions}
              editable={editable}
              initialSection={
                incompleteFields.length ? "controls" : savedSection
              }
              portfolioDecisionLocked
              portfolioSelection={portfolioSelection}
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

          <Separator className="mt-auto" />
          <div className="grid gap-4">
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
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
