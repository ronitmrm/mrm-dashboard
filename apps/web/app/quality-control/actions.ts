"use server"
import { revalidatePath } from "next/cache"
import { unstable_rethrow } from "next/navigation"
import { withRejections } from "@/lib/rejections-server"

export async function saveQualityRejection(form: FormData) {
  try {
    await withRejections("write", ({ repository, organizationId, userId }) =>
      repository.save({
        organizationId,
        userId,
        requestId: String(form.get("requestId")),
        jobId: String(form.get("jobId")),
        date: String(form.get("date")),
        stage: String(form.get("stage")),
        typeId: String(form.get("typeId")),
        defectId: String(form.get("defectId")),
        reasonId: String(form.get("reasonId")),
        pieces: Number(form.get("pieces")),
        kg: Number(form.get("kg")),
      })
    )
    revalidatePath("/iso-document/rejections")
    return { success: true }
  } catch (error) {
    unstable_rethrow(error)
    return {
      error:
        error instanceof Error && !("code" in error)
          ? error.message
          : "Rejection could not be saved. Please try again.",
    }
  }
}
