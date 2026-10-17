import { createRecruitmentRepository } from "@workspace/db"

import { attachmentContentDisposition } from "@/lib/attachment-viewer"
import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"
import { buildJobPostPdf } from "@/lib/hr/job-post-pdf"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  await requireCapability("hr.jobs.read", `/hr/jobs/${id}`)
  const repository = createRecruitmentRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  try {
    const organizationId = await repository.organizationIdForCode("MRMPL")
    const job = await repository.getJobPostDocument(organizationId, id)
    if (!job) return new Response("Job Post not found.", { status: 404 })
    const bytes = await buildJobPostPdf(job)
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Type": "application/pdf",
        "Content-Length": String(bytes.byteLength),
        "Content-Disposition": attachmentContentDisposition(
          request.url,
          `${job.jobNumber}-job-post.pdf`
        ),
      },
    })
  } finally {
    await repository.close()
  }
}
