import { randomUUID } from "node:crypto"

export function storePurchaseOrderIssuanceId(
  value: FormDataEntryValue | null,
  generateId: () => string = randomUUID
) {
  return (typeof value === "string" ? value.trim() : "") || generateId()
}
