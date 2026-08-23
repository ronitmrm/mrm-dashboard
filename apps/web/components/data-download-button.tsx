"use client"

import { Download } from "lucide-react"

import { Button } from "@workspace/ui/components/button"

export function DataDownloadButton({
  disabled,
  href,
  label = "Download Excel",
  onClick,
}: {
  disabled?: boolean
  href?: string
  label?: string
  onClick?: () => void
}) {
  const content = (
    <>
      <Download className="size-4" data-icon="inline-start" />
      {label}
    </>
  )

  return href ? (
    <Button asChild size="sm" variant="outline">
      <a href={href}>{content}</a>
    </Button>
  ) : (
    <Button
      disabled={disabled}
      onClick={onClick}
      size="sm"
      type="button"
      variant="outline"
    >
      {content}
    </Button>
  )
}
