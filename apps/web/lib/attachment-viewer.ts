export function safeAttachmentSource(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return null
  try {
    const parsed = new URL(value, "https://local.invalid")
    return parsed.origin === "https://local.invalid"
      ? `${parsed.pathname}${parsed.search}`
      : null
  } catch {
    return null
  }
}

export function attachmentViewerHref(input: {
  byteSize?: number | null
  fileName: string
  mediaType?: string | null
  source: string
}) {
  const source = safeAttachmentSource(input.source)
  if (!source) throw new Error("Attachment viewer source must be same-origin.")
  const search = new URLSearchParams({ name: input.fileName, src: source })
  if (input.mediaType) search.set("type", input.mediaType)
  if (input.byteSize !== null && input.byteSize !== undefined) {
    search.set("size", String(input.byteSize))
  }
  return `/attachments/view?${search.toString()}`
}

export function attachmentContentDisposition(
  requestUrl: string,
  fileName: string
) {
  const safeName = fileName.replace(/[\r\n"]/g, "_")
  const disposition = new URL(requestUrl).searchParams.has("download")
    ? "attachment"
    : "inline"
  return (
    `${disposition}; filename="${safeName}"; filename*=UTF-8''` +
    encodeURIComponent(safeName)
  )
}

export function attachmentSourceWithMode(
  source: string,
  mode: "download" | "preview"
) {
  const parsed = new URL(source, "https://local.invalid")
  parsed.searchParams.set(mode, "1")
  return `${parsed.pathname}${parsed.search}`
}
