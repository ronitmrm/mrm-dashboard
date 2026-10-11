import { notFound } from "next/navigation"
import { meetingReference } from "@workspace/db/management-review-domain"
import { withManagementReview } from "@/lib/iso-document/management-review-server"
import { managementReviewPdf } from "@/lib/iso-document/management-review-pdf"
import { attachmentContentDisposition } from "@/lib/attachment-viewer"

export const runtime = "nodejs"
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) notFound()
  return withManagementReview(async ({ repository, access }) => {
    const dossier = await repository.meetingDossier(access, id)
    if (!dossier) notFound()
    const bytes = await managementReviewPdf(
      dossier.entry,
      dossier.actionReviews
    )
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": attachmentContentDisposition(
          request.url,
          `${meetingReference(dossier.entry.number)}-minutes.pdf`
        ),
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    })
  })
}
