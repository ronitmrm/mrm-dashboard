import { createElement } from "react"

import Link from "next/link"

import { DataDownloadButton } from "./data-download-button"

type Coverage = {
  limit: number
  returned: number
  total?: number
  truncated: boolean
}

export function BoundedResultNotice({
  actionHref,
  actionLabel,
  coverage,
  error,
  searchQuery,
  section,
}: {
  actionHref?: string
  actionLabel?: string
  coverage?: Coverage
  error?: string | null
  searchQuery?: string
  section: string
}) {
  if (error) {
    return createElement(
      "p",
      { className: "text-xs text-destructive", role: "alert" },
      `${section} could not be loaded: ${error}`
    )
  }
  if (!coverage || (!coverage.truncated && !searchQuery)) return null
  const scope = searchQuery ? ` for “${searchQuery}”` : ""
  if (!coverage.truncated) {
    return createElement(
      "p",
      { className: "text-xs text-muted-foreground", role: "status" },
      `${section}: ${coverage.returned} results${scope}.`
    )
  }
  const total = coverage.total === undefined ? "" : ` of ${coverage.total}`
  const message = `${section}: showing ${coverage.returned}${total} results${scope}; more match.`
  const downloadLabel = actionHref?.includes(".xlsx")
    ? "Download Excel"
    : actionHref?.includes(".csv")
      ? "Download CSV"
      : null
  if (actionHref && actionLabel && downloadLabel) {
    return createElement(
      "div",
      {
        className: "flex flex-wrap items-center justify-between gap-2",
        role: "status",
      },
      createElement("p", { className: "text-xs text-muted-foreground" }, message),
      createElement(DataDownloadButton, {
        href: actionHref,
        label: downloadLabel,
      })
    )
  }
  return createElement(
    "p",
    { className: "text-xs text-muted-foreground", role: "status" },
    message,
    actionHref && actionLabel ? " " : null,
    actionHref && actionLabel
      ? createElement(
          Link,
          { className: "underline underline-offset-4", href: actionHref },
          actionLabel
        )
      : null,
    actionHref && actionLabel ? "." : null
  )
}
