"use server"
import { revalidatePath } from "next/cache"
import { unstable_rethrow } from "next/navigation"
import { brandingType, withBranding } from "@/lib/branding/server"
import { parseBrandingContent } from "@workspace/db/branding-domain"
import { generateBrandingPdf } from "@/lib/branding/pdf"
function message(error: unknown) {
  unstable_rethrow(error)
  return error instanceof Error && !("code" in error)
    ? error.message
    : "The document could not be saved. Please try again."
}
export async function saveBrandingDraft(input: {
  type: string
  documentId?: string
  version?: number
  content: unknown
}) {
  const type = brandingType(input.type)
  try {
    const id = await withBranding(type, "write", ({ repository, ...context }) =>
      repository.save({
        ...context,
        type,
        documentId: input.documentId,
        version: input.version,
        content: parseBrandingContent(input.content, type),
      })
    )
    revalidatePath(`/branding/${type}`)
    revalidatePath(`/branding/${type}/${id}`)
    return { id }
  } catch (error) {
    return { error: message(error) }
  }
}
export async function reviseBrandingDocument(input: {
  type: string
  documentId: string
}) {
  const type = brandingType(input.type)
  try {
    await withBranding(type, "write", ({ repository, ...context }) =>
      repository.revise({ ...context, type, documentId: input.documentId })
    )
    revalidatePath(`/branding/${type}/${input.documentId}`)
    return { success: true }
  } catch (error) {
    return { error: message(error) }
  }
}
export async function issueBrandingDocument(input: {
  type: string
  documentId: string
  revisionId: string
  version: number
}) {
  const type = brandingType(input.type)
  try {
    await withBranding(type, "write", ({ repository, ...context }) =>
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
    revalidatePath(`/branding/${type}`)
    revalidatePath(`/branding/${type}/${input.documentId}`)
    return { success: true }
  } catch (error) {
    return { error: message(error) }
  }
}
