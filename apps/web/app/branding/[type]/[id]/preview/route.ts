import { brandingType } from "@/lib/branding/server"
import { generateBrandingPdf } from "@/lib/branding/pdf"
import { attachmentContentDisposition } from "@/lib/attachment-viewer"
import { withDocumentContentAccess } from "@/lib/iso-document/server"
export const maxDuration = 60
export async function GET(
  request: Request,
  { params }: { params: Promise<{ type: string; id: string }> }
) {
  const { type: rawType, id } = await params
  const type = brandingType(rawType)
  if (!/^[0-9a-f-]{36}$/i.test(id))
    return new Response("Not found", { status: 404 })
  return withDocumentContentAccess(
    {
      documentId: id,
      type,
      draft: true,
      returnPath: `/branding/${type}/${id}`,
    },
    async ({ repository, organizationId }) => {
      if (type === "controlled-document") {
        const uploaded = await repository.uploadedDraftPdf(organizationId, id)
        if (!uploaded)
          return new Response("Upload a draft PDF first", { status: 404 })
        return new Response(new Uint8Array(uploaded.pdf), {
          headers: {
            "Content-Type": "application/pdf",
            "Cache-Control": "private, no-store",
            "Content-Disposition": attachmentContentDisposition(
              request.url,
              "Draft.pdf"
            ),
            "X-Content-Type-Options": "nosniff",
          },
        })
      }
      const document = await repository.get(organizationId, type, id)
      const draft = document?.revisions.find(
        (revision) => revision.state === "draft"
      )
      if (type === "notice" && document?.number)
        return new Response(
          "Issued documents of this type do not have drafts",
          {
            status: 404,
          }
        )
      if (!draft?.content.translations.length || !document)
        return new Response("No draft content to preview", { status: 404 })
      const bytes = await generateBrandingPdf({
        type,
        content: draft.content,
        number: document.number ?? "Not issued",
        revision: draft.revision,
        issuedAt: draft.updatedAt,
        authorName: draft.authorName,
        draft: true,
      })
      return new Response(new Uint8Array(bytes), {
        headers: {
          "Content-Type": "application/pdf",
          "Cache-Control": "private, no-store",
          "Content-Disposition": attachmentContentDisposition(
            request.url,
            "Draft.pdf"
          ),
          "X-Content-Type-Options": "nosniff",
        },
      })
    }
  )
}
