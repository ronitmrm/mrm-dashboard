import Link from "next/link"

import { attachmentViewerHref } from "@/lib/attachment-viewer"

export function AttachmentViewerLink({
  byteSize,
  children,
  className,
  fileName,
  href,
  mediaType,
}: {
  byteSize?: number | null
  children?: React.ReactNode
  className?: string
  fileName: string
  href: string
  mediaType?: string | null
}) {
  return (
    <Link
      className={className}
      href={attachmentViewerHref({
        byteSize,
        fileName,
        mediaType,
        source: href,
      })}
    >
      {children ?? fileName}
    </Link>
  )
}
