import type { StoreTrackingMode } from "@workspace/db"

export function createStoreIssueFormModel(input: {
  actorEmail: string
  availableUnitIds: string[]
  department: string
  trackingMode: StoreTrackingMode
}) {
  const requiresUnitSelection = input.trackingMode === "SERIALIZED"

  return {
    availableUnitIds: requiresUnitSelection ? input.availableUnitIds : [],
    department: input.department,
    issuedBy: input.actorEmail,
    requiresUnitSelection,
  }
}
