import { withPublishedRegister } from "@/lib/branding/published-server"
import { attachmentContentDisposition } from "@/lib/attachment-viewer"
import { revisionLabel } from "@workspace/db/branding-domain"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ type: string; id: string }> }
) {
  const { type, id } = await params
  return withPublishedRegister(
    type,
    async ({ repository, organizationId, type }) => {
      if (!/^[0-9a-f-]{36}$/i.test(id))
        return new Response("Not found", { status: 404 })
      const pdf = await repository.publishedPdf(organizationId, type, id)
      if (!pdf) return new Response("PDF not found", { status: 404 })
      return new Response(new Uint8Array(pdf.pdf), {
        headers: {
          "Content-Type": "application/pdf",
          "Cache-Control": "private, no-store",
          "Content-Disposition": attachmentContentDisposition(
            request.url,
            `${pdf.number}${type === "work-instruction" ? "" : `-${revisionLabel(pdf.revision)}`}.pdf`
          ),
          "X-Content-Type-Options": "nosniff",
        },
      })
    }
  )
}
