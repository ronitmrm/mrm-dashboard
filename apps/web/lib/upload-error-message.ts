export function getUploadErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim())
    return error.message.trim()
  return fallback
}

export function getUploadResultError(result: unknown) {
  if (
    typeof result === "object" &&
    result !== null &&
    "error" in result &&
    typeof result.error === "string" &&
    result.error.trim()
  ) {
    return result.error.trim()
  }
  return undefined
}
