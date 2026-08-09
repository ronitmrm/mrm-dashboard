import { createElement } from "react"

import Link from "next/link"

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
  return createElement(
    "p",
    { className: "text-xs text-muted-foreground", role: "status" },
    `${section}: showing ${coverage.returned}${total} results${scope}; more match.`,
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
