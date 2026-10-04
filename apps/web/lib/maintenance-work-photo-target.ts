import type { MaintenanceWorkPhotoTarget } from "@workspace/db"

export const MAX_MAINTENANCE_WORK_PHOTOS = 12

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function parseMaintenanceWorkPhotoTarget(value: unknown): MaintenanceWorkPhotoTarget {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Maintenance photo target is invalid.")
  }
  const input = value as Record<string, unknown>
  if (input.kind === "machine" && typeof input.taskKey === "string" &&
    input.taskKey.trim() && input.taskKey.length <= 255) {
    return { kind: "machine", taskKey: input.taskKey.trim() }
  }
  const dueOn = input.dueOn
  const parsedDueOn = typeof dueOn === "string" ? new Date(`${dueOn}T00:00:00Z`) : null
  if (input.kind === "asset-planned" && typeof input.scheduleId === "string" &&
    uuid.test(input.scheduleId) && typeof dueOn === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(dueOn) && parsedDueOn &&
    !Number.isNaN(parsedDueOn.getTime()) && parsedDueOn.toISOString().slice(0, 10) === dueOn) {
    return { kind: "asset-planned", scheduleId: input.scheduleId, dueOn }
  }
  if (input.kind === "asset-breakdown" && typeof input.breakdownId === "string" &&
    uuid.test(input.breakdownId)) {
    return { kind: "asset-breakdown", breakdownId: input.breakdownId }
  }
  throw new Error("Maintenance photo target is invalid.")
}

export function maintenanceWorkPhotoQuery(target: MaintenanceWorkPhotoTarget) {
  return new URLSearchParams(target).toString()
}
