export const tableFilterIgnoredSelector = [
  '[data-filter-ignore="true"]',
  "button",
  "form",
  "input",
  "select",
  "textarea",
].join(", ")

export const tableFilterSecondarySelector = ".text-muted-foreground"

export const tableSecondaryTextSelector = [
  "div.text-muted-foreground",
  "span.text-muted-foreground",
  "p.text-muted-foreground",
  "small.text-muted-foreground",
].join(", ")

export function isTableSecondaryPlaceholder(value: string | null | undefined) {
  const normalized = value?.trim() ?? ""
  return normalized === "" || normalized === "-" || normalized === "—"
}

export function hasMeaningfulTableFilterValue(
  values: Array<string | null | undefined>
) {
  return values.some((value) => !isTableSecondaryPlaceholder(value))
}

export function shouldShowTableFilter({
  forceFilter,
  hasRows,
  isActionColumn,
  label,
  values,
}: {
  forceFilter: boolean
  hasRows: boolean
  isActionColumn: boolean
  label: string
  values: Array<string | null | undefined>
}) {
  if (!label) return false
  if (!hasRows) {
    const actionLabel = /^(actions?|select|workspace)$/i.test(label.trim())
    return forceFilter || (!isActionColumn && !actionLabel)
  }
  return !(
    isActionColumn &&
    !forceFilter &&
    !hasMeaningfulTableFilterValue(values)
  )
}
export function joinTableFilterTextParts(
  parts: Array<string | null | undefined>
) {
  return parts
    .map((part) => part?.trim() ?? "")
    .filter(Boolean)
    .join(" ")
}

export function resolveTableFilterText(
  primaryParts: Array<string | null | undefined>,
  fallbackParts: Array<string | null | undefined>
) {
  return (
    joinTableFilterTextParts(primaryParts) ||
    joinTableFilterTextParts(fallbackParts)
  )
}
