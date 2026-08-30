import {
  createRecruitmentEmploymentLetterRepository,
  createRecruitmentRepository,
} from "@workspace/db"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireHrPage } from "@/lib/auth/require-hr-page"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await requireHrPage("hr.employees.read", "/hr?panel=employeeMasterPanel")
  const { id } = await params
  const connectionString = readAuthEnvironment().connectionString
  const recruitment = createRecruitmentRepository({ connectionString })
  const letters = createRecruitmentEmploymentLetterRepository({
    connectionString,
  })
  try {
    const organizationId = await recruitment.organizationIdForCode("MRMPL")
    const pdf = await letters.getPdf(id, organizationId)
    return new Response(new Uint8Array(pdf.bytes), {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="${pdf.fileName}"`,
        "Content-Length": String(pdf.bytes.byteLength),
        "Content-Type": "application/pdf",
      },
    })
  } catch (error) {
    if (error instanceof Error && error.message.includes("not found")) {
      return new Response(error.message, { status: 404 })
    }
    throw error
  } finally {
    await Promise.all([recruitment.close(), letters.close()])
  }
}
