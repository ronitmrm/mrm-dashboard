export function ecnHref(engineeringChangeNoteId: string) {
  return `/commercial/ecns/${encodeURIComponent(engineeringChangeNoteId)}`
}

export function ecnDesignHref(engineeringChangeNoteId: string) {
  return `${ecnHref(engineeringChangeNoteId)}/design`
}

export function ecnStageHref(engineeringChangeNoteId: string, status: string) {
  return status === "Pending Design"
    ? ecnDesignHref(engineeringChangeNoteId)
    : ecnHref(engineeringChangeNoteId)
}

export function ecnProductOptionLabel(product: {
  category?: string | null
  description: string
  subcategory?: string | null
  uid: string
}) {
  return [
    product.uid,
    product.category,
    product.subcategory,
    product.description,
  ]
    .map((value) => value?.trim())
    .filter(Boolean)
    .join(" · ")
}
