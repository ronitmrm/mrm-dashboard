import { brandingType, withBranding } from "@/lib/branding/server"
import { attachmentContentDisposition } from "@/lib/attachment-viewer"
import { revisionLabel } from "@workspace/db/branding-domain"
export async function GET(
  request: Request,
  {
    params,
  }: { params: Promise<{ type: string; id: string; revisionId: string }> }
) {
  const { type: rawType, id, revisionId } = await params
  const type = brandingType(rawType)
  if (![id, revisionId].every((value) => /^[0-9a-f-]{36}$/i.test(value)))
    return new Response("Not found", { status: 404 })
  const pdf = await withBranding(
    type,
    "read",
    ({ repository, organizationId }) =>
      repository.pdf(organizationId, type, id, revisionId)
  )
  if (!pdf) return new Response("PDF not found", { status: 404 })
  return new Response(new Uint8Array(pdf.pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Cache-Control": "private, no-store",
      "Content-Disposition": attachmentContentDisposition(
        request.url,
        `${pdf.number}${type === "notice" ? "" : `-${revisionLabel(pdf.revision)}`}.pdf`
      ),
      "X-Content-Type-Options": "nosniff",
    },
  })
}
