import "server-only"

import { unstable_rethrow } from "next/navigation"

import { getUploadErrorMessage } from "@/lib/upload-error-message"

export async function withCsvImportFeedback<T>(
  importCsv: () => Promise<T>,
  fallback: string
): Promise<T | { error: string }> {
  try {
    return await importCsv()
  } catch (error) {
    unstable_rethrow(error)
    return { error: getUploadErrorMessage(error, fallback) }
  }
}
