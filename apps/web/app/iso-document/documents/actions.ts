"use server"

import { revalidatePath } from "next/cache"
import { unstable_rethrow } from "next/navigation"
import {
  isBrandingType,
  type BrandingType,
} from "@workspace/db/branding-domain"
import { parseDocumentControlMetadata } from "@workspace/db/document-control-domain"
import { generateBrandingPdf } from "@/lib/branding/pdf"
import { withDocumentControl } from "@/lib/iso-document/server"

function actionType(value: string): BrandingType {
  if (!isBrandingType(value)) throw new Error("Document type is invalid.")
  return value
}

function message(error: unknown) {
  unstable_rethrow(error)
  return error instanceof Error && !("code" in error)
    ? error.message
    : "The document could not be updated. Please try again."
}

function revalidateDocument(type: BrandingType, documentId: string) {
  revalidatePath("/iso-document/documents")
  revalidatePath(`/iso-document/documents/${documentId}`)
  revalidatePath(`/branding/${type}`)
  revalidatePath(`/branding/${type}/${documentId}`)
  revalidatePath(`/registers/${type}`)
}

export async function saveDocumentControlMetadata(input: {
  documentId: string
  version: number
  metadata: unknown
}) {
  try {
    await withDocumentControl(
      "manage",
      ({ repository, organizationId, userId }) =>
        repository.saveControlMetadata({
          organizationId,
          documentId: input.documentId,
          version: input.version,
          metadata: parseDocumentControlMetadata(input.metadata),
          userId,
        })
    )
    revalidatePath("/iso-document/documents")
    revalidatePath(`/iso-document/documents/${input.documentId}`)
    return { success: true }
  } catch (error) {
    return { error: message(error) }
  }
}

export async function submitDocumentRevision(input: {
  type: string
  documentId: string
  revisionId: string
  version: number
}) {
  const type = actionType(input.type)
  try {
    await withDocumentControl(
      "manage",
      ({ repository, organizationId, userId }) =>
        repository.submitForApproval({
          organizationId,
          type,
          documentId: input.documentId,
          revisionId: input.revisionId,
          version: input.version,
          userId,
        })
    )
    revalidateDocument(type, input.documentId)
    return { success: true }
  } catch (error) {
    return { error: message(error) }
  }
}

export async function decideDocumentApproval(input: {
  documentId: string
  revisionId: string
  approve: boolean
  remarks: string
  type: string
}) {
  const type = actionType(input.type)
  try {
    await withDocumentControl(
      "approve",
      async ({ repository, organizationId, userId }) =>
        repository.decideApproval({
          organizationId,
          documentId: input.documentId,
          revisionId: input.revisionId,
          userId,
          approve: input.approve,
          remarks: input.remarks,
          permittedDepartments: await repository.approvalDepartments({
            organizationId,
            userId,
          }),
        })
    )
    revalidateDocument(type, input.documentId)
    return { success: true }
  } catch (error) {
    return { error: message(error) }
  }
}

export async function releaseDocumentRevision(input: {
  type: string
  documentId: string
  revisionId: string
  version: number
}) {
  const type = actionType(input.type)
  try {
    await withDocumentControl("release", ({ repository, ...context }) =>
      repository.issue(
        {
          ...context,
          type,
          documentId: input.documentId,
          revisionId: input.revisionId,
          version: input.version,
        },
        generateBrandingPdf
      )
    )
    revalidateDocument(type, input.documentId)
    return { success: true }
  } catch (error) {
    return { error: message(error) }
  }
}

export async function confirmDocumentMonitoring(input: {
  documentId: string
  obligationType: "document-review" | "data-record"
  periodLabel: string
  evidenceLocation: string
  remarks: string
}) {
  try {
    await withDocumentControl("monitor", ({ repository, ...context }) =>
      repository.confirmMonitoring({ ...context, ...input })
    )
    revalidatePath(`/iso-document/documents/${input.documentId}`)
    return { success: true }
  } catch (error) {
    return { error: message(error) }
  }
}
