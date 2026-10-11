import { notFound } from "next/navigation"
import { requirementReference } from "@workspace/db/interested-parties-domain"
import { attachmentContentDisposition } from "@/lib/attachment-viewer"
import { interestedPartiesPdf } from "@/lib/iso-document/interested-parties-pdf"
import { withInterestedParties } from "@/lib/iso-document/interested-parties-server"
export const runtime = "nodejs"
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) notFound()
  return withInterestedParties(async ({ repository, access }) => {
    const dossier = await repository.dossier(access, id)
    if (!dossier) notFound()
    return new Response(
      new Uint8Array(
        await interestedPartiesPdf(dossier.entry, dossier.reviews)
      ),
      {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": attachmentContentDisposition(
            request.url,
            `${requirementReference(dossier.entry.number)}-monitoring.pdf`
          ),
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      }
    )
  })
}
