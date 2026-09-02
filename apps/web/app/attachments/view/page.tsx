import Link from "next/link"
import { notFound } from "next/navigation"

import { Button } from "@workspace/ui/components/button"

import {
  attachmentSourceWithMode,
  safeAttachmentSource,
} from "@/lib/attachment-viewer"
import { requireAuthenticatedSession } from "@/lib/auth/require-capability"

export const dynamic = "force-dynamic"

function bytes(value: string | undefined) {
  const size = Number(value)
  return Number.isFinite(size) && size >= 0
    ? new Intl.NumberFormat("en-IN", {
        maximumFractionDigits: 1,
        style: "unit",
        unit: size >= 1_000_000 ? "megabyte" : "kilobyte",
        unitDisplay: "short",
      }).format(size / (size >= 1_000_000 ? 1_000_000 : 1_000))
    : "Size unavailable"
}

export default async function AttachmentViewerPage({
  searchParams,
}: {
  searchParams: Promise<{
    name?: string
    size?: string
    src?: string
    type?: string
  }>
}) {
  const query = await searchParams
  const source = safeAttachmentSource(query.src)
  if (!source) notFound()
  await requireAuthenticatedSession(
    `/attachments/view?src=${encodeURIComponent(source)}`
  )
  const fileName = query.name?.trim() || "Attachment"
  const mediaType = query.type?.trim() || "Unknown media type"
  const previewable =
    mediaType === "application/pdf" ||
    mediaType.startsWith("image/") ||
    /\.(pdf|png|jpe?g)$/i.test(fileName)
  const previewHref = attachmentSourceWithMode(source, "preview")
  const downloadHref = attachmentSourceWithMode(source, "download")

  return (
    <main className="flex min-h-svh flex-col bg-background">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0">
          <h1 className="truncate font-medium">{fileName}</h1>
          <p className="text-xs text-muted-foreground">
            {mediaType} · {bytes(query.size)}
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href={downloadHref}>Download Original</Link>
          </Button>
        </div>
      </header>
      {previewable ? (
        <iframe
          className="min-h-0 flex-1 bg-muted"
          src={previewHref}
          title={`Preview ${fileName}`}
        />
      ) : (
        <div className="grid flex-1 place-items-center p-8 text-center text-sm text-muted-foreground">
          Preview is unavailable for this file type. Download the original to
          open it in its native application.
        </div>
      )}
    </main>
  )
}
