"use server"

import { revalidatePath } from "next/cache"
import { unstable_rethrow } from "next/navigation"
import {
  AnalysisError,
  isAnalysisKind,
  type AnalysisOperation,
} from "@workspace/db/iso-analysis-domain"
import { withIsoAnalysis } from "@/lib/iso-document/analysis-server"
import { parseAnalysisWorkbook } from "./workbook"

function refresh() {
  revalidatePath("/iso-document/analysis/pest")
  revalidatePath("/iso-document/analysis/swot")
  revalidatePath("/iso-document/analysis/risk")
  revalidatePath("/iso-document/analysis/[kind]/[id]", "page")
}
function errorMessage(error: unknown) {
  unstable_rethrow(error)
  return error instanceof AnalysisError
    ? error.message
    : "Could not save the analysis. Try again."
}
export async function saveAnalysisAction(formData: FormData) {
  try {
    const id = formData.get("id")?.toString()
    const fields = Object.fromEntries(formData.entries())
    const risk = Object.fromEntries(
      [
        "process",
        "cause",
        "controls",
        "likelihood",
        "severity",
        "basis",
        "treatment",
        "monitoring",
        "frequency",
        "triggers",
        "references",
      ].map((key) => [key, formData.get(`risk_${key}`)])
    )
    const savedId = await withIsoAnalysis(({ repository, access }) =>
      repository.save(
        access,
        { ...fields, risk },
        id
          ? {
              id,
              version: Number(formData.get("version")),
              reason: formData.get("reason")?.toString() ?? "",
            }
          : undefined
      )
    )
    refresh()
    return { id: savedId }
  } catch (error) {
    return { error: errorMessage(error) }
  }
}
export async function updateAnalysisAction(formData: FormData) {
  try {
    const operation = formData.get("operation")?.toString()
    const operations: readonly string[] = [
      "progress",
      "complete",
      "verify",
      "return",
      "reopen",
      "review",
    ]
    if (!operation || !operations.includes(operation))
      throw new AnalysisError("Choose a valid action.")
    await withIsoAnalysis(({ repository, access }) =>
      repository.update(access, {
        id: formData.get("id")?.toString() ?? "",
        version: Number(formData.get("version")),
        operation: operation as AnalysisOperation,
        notes: formData.get("notes")?.toString() ?? "",
        evidenceLocation: formData.get("evidenceLocation")?.toString() ?? "",
        effectivenessNotes: formData.get("effectivenessNotes")?.toString(),
        reviewedOn: formData.get("reviewedOn")?.toString(),
        nextReviewOn: formData.get("nextReviewOn")?.toString(),
        riskReview: Object.fromEntries(
          [
            "likelihood",
            "severity",
            "decision",
            "acceptance",
            "authorization",
          ].map((key) => [key, formData.get(`residual_${key}`)])
        ),
      })
    )
    refresh()
    return { success: true }
  } catch (error) {
    return { error: errorMessage(error) }
  }
}
export async function importAnalysisAction(formData: FormData) {
  try {
    const kind = formData.get("kind")
    const file = formData.get("analysis_file")
    if (
      !isAnalysisKind(kind) ||
      !(file instanceof File) ||
      !file.name.toLowerCase().endsWith(".xlsx") ||
      file.size === 0 ||
      file.size > 5 * 1024 * 1024
    )
      throw new AnalysisError(
        "Choose a PEST, SWOT or risk Excel workbook up to 5 MB."
      )
    return await withIsoAnalysis(async ({ repository, access }) => {
      if (!access.canManage)
        throw new AnalysisError("Manage Analyses permission is required.")
      const rows = parseAnalysisWorkbook(
        Buffer.from(await file.arrayBuffer()),
        file.name,
        kind
      )
      const result = await repository.importRows(access, rows)
      refresh()
      return result
    })
  } catch (error) {
    return { error: errorMessage(error) }
  }
}
