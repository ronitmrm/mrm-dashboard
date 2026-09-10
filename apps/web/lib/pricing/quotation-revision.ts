/** Whole-quotation numbering is independent of item-price revisions. */
export function quotationRevisionLabel(revision: number) {
  return `Revision ${String(revision).padStart(2, "0")}`
}
