import Link from "next/link"
import { notFound } from "next/navigation"

import {
  createCommercialWorkflowRepository,
  createProductPortfolioRepository,
} from "@workspace/db"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent } from "@workspace/ui/components/card"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"

import { DesignTaskEditor } from "../../../design/design-task-editor"

export const dynamic = "force-dynamic"

export default async function CurrentProductDesignTaskPage({
  params,
}: {
  params: Promise<{ uid: string }>
}) {
  const { uid } = await params
  const path = `/commercial/products/${encodeURIComponent(uid)}/design`
  await requireCapability("pricing.products.read", path)

  const connectionString = readAuthEnvironment().connectionString
  const portfolio = createProductPortfolioRepository({ connectionString })
  const workflow = createCommercialWorkflowRepository({ connectionString })
  const data = await (async () => {
    try {
      const dossier = await portfolio.getDossierForOrganization("MRMPL", uid)
      if (!dossier) return null
      const [designOptions, selectedItem] = await Promise.all([
        workflow.getDesignWorkspaceOptions("MRMPL"),
        dossier.designTaskEnquiryItemId
          ? workflow.getDesignTask("MRMPL", dossier.designTaskEnquiryItemId)
          : Promise.resolve(null),
      ])
      return { designOptions, dossier, selectedItem }
    } finally {
      await Promise.all([portfolio.close(), workflow.close()])
    }
  })()
  if (!data) notFound()

  const { designOptions, dossier, selectedItem } = data
  const canonicalProducts = [
    ...new Map(
      dossier.bom.map((line) => [
        line.componentItemId,
        {
          blankPieceWeight: line.blankPieceWeight,
          category: line.category,
          description: line.description,
          grade: line.grade,
          id: line.componentItemId,
          itemType: line.itemType,
          lineNotes: line.notes,
          pieceWeight: line.weight,
          processRequired: line.processesRequired.join(", ") || null,
          productSize: line.productSize,
          productType: line.productType,
          productionType: line.productionType,
          rodSize: line.rodSize,
          rodType: line.rodType,
          subcategory: line.subCategory,
          uid: line.componentUid,
        },
      ])
    ).values(),
  ]
  const savedRootLine = selectedItem?.bomLines[0] ?? {
    bomItem: null,
    casting: dossier.blankPieceWeight,
    componentCategory: dossier.category,
    componentCode: dossier.uid,
    componentItemType: dossier.itemType,
    componentProductSize: dossier.productSize,
    componentSource: "New",
    componentSubcategory: dossier.subCategory,
    drawingRequirement: dossier.drawing?.requirement ?? "Required",
    existingProductId: null,
    grade: null,
    lineNumber: 1,
    manufacturingProcess: dossier.productionType,
    notes: null,
    packagePart: null,
    packagePartUid: null,
    parentLineNumber: null,
    pieceWeight: dossier.productWeight,
    productionType: dossier.productType,
    processRequired: dossier.processesRequired.join(", ") || null,
    quantity: 1,
    rodSize: dossier.rodSize,
    rodType: dossier.rodType,
  }
  const canonicalBomLines = ["Package", "Assembly"].includes(dossier.itemType)
    ? dossier.bom.map((line) => ({
        bomItem: null,
        casting: line.blankPieceWeight,
        componentCategory: line.category,
        componentCode: line.componentUid,
        componentItemType: line.itemType,
        componentProductSize: line.productSize,
        componentSource: "Existing",
        componentSubcategory: line.subCategory,
        drawingRequirement: line.drawingRequirement,
        existingProductId: line.componentItemId,
        grade: line.grade,
        lineNumber: line.lineNumber,
        manufacturingProcess: line.productionType,
        notes: line.notes,
        packagePart: line.description,
        packagePartUid: line.componentUid,
        parentLineNumber: line.parentLineNumber,
        pieceWeight: line.weight,
        productionType: line.productType,
        processRequired: line.processesRequired.join(", ") || null,
        quantity: line.quantity,
        rodSize: line.rodSize,
        rodType: line.rodType,
      }))
    : [
        {
          ...savedRootLine,
          casting: dossier.blankPieceWeight,
          componentCategory: dossier.category,
          componentCode: dossier.uid,
          componentItemType: dossier.itemType,
          componentProductSize: dossier.productSize,
          componentSubcategory: dossier.subCategory,
          manufacturingProcess: dossier.productionType,
          pieceWeight: dossier.productWeight,
          productionType: dossier.productType,
          processRequired: dossier.processesRequired.join(", ") || null,
          rodSize: dossier.rodSize,
          rodType: dossier.rodType,
        },
        ...(selectedItem?.bomLines.slice(1) ?? []),
      ]
  const attachments = selectedItem
    ? selectedItem.attachments.map((attachment) => ({
        fileName: attachment.fileName,
        href: `/commercial/design/${selectedItem.designId}/file/${attachment.purpose}`,
        purpose: attachment.purpose,
      }))
    : dossier.drawing?.fileName
      ? [
          {
            fileName: dossier.drawing.fileName,
            href: `/commercial/drawing-history/${encodeURIComponent(dossier.uid)}/file/${dossier.drawing.revision}`,
            purpose: "internal_drawing",
          },
        ]
      : []

  return (
    <div className="grid gap-6">
      <section className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-2">
          <Button asChild className="w-fit" size="sm" variant="ghost">
            <Link href={`/commercial/products/${encodeURIComponent(uid)}`}>
              Back to Product Dossier
            </Link>
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-semibold tracking-tight">
              {dossier.uid} · Complete Design Task
            </h2>
            <Badge>{dossier.design?.revision ?? "Current"}</Badge>
            <Badge variant="outline">Read-only</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Current released revision. All original Design Task tabs remain
            available for review.
          </p>
        </div>
      </section>

      <Card>
        <CardContent className="p-4 lg:p-6">
          <DesignTaskEditor
            attachments={attachments}
            designOptions={designOptions}
            editable={false}
            initial={{
              bomLines: canonicalBomLines,
              checkedBy: selectedItem?.checkedBy ?? null,
              componentsRequired: selectedItem?.componentsRequired ?? null,
              designBomCompleted: selectedItem?.designBomCompleted ?? "Yes",
              designRemarks: selectedItem?.designRemarks ?? null,
              drawingRequirement:
                selectedItem?.drawingRequirement ??
                dossier.drawing?.requirement ??
                "Required",
              designerName: selectedItem?.designerName ?? null,
              fixtureApproxCost: selectedItem?.fixtureApproxCost ?? 0,
              fixtureRequired: selectedItem?.fixtureRequired ?? "No",
              gaugesRequired: selectedItem?.gaugesRequired ?? "No",
              inspectionApproxCost: selectedItem?.inspectionApproxCost ?? 0,
              internalPartCategory: dossier.category,
              internalPartSize: dossier.productSize,
              internalPartSubCategory: dossier.subCategory,
              itemType: dossier.itemType,
              manufacturingProcess: dossier.productionType,
              matchedProductId: selectedItem?.matchedProductId ?? null,
              operationNotes: selectedItem?.operationNotes ?? null,
              packageProcessRequired:
                selectedItem?.packageProcessRequired ?? null,
              portfolioMatchStatus:
                selectedItem?.portfolioMatchStatus ?? "New Quoted Part",
              quotedPartUid: dossier.uid,
              targetCompletionDate: selectedItem?.targetCompletionDate ?? null,
              toolingApproxCost: selectedItem?.toolingApproxCost ?? 0,
              toolingRequired: selectedItem?.toolingRequired ?? "No",
            }}
            portfolioDecisionLocked
            products={canonicalProducts}
          />
        </CardContent>
      </Card>
    </div>
  )
}
