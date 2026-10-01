import { productionFloors, type ProductionFloorCode } from "@workspace/db/production-floors"

import type { PageAccessDefinition } from "./page-access-types"

export function departmentStoreCapability(
  floor: ProductionFloorCode,
  access: "read" | "write" | "request"
) {
  return `operations.floors.${floor}.store.${access}`
}

export function departmentStoreHref(floor: ProductionFloorCode) {
  return `/production-store/${floor}`
}

export function accountableStorePermission(storeCode: string, access: "read" | "write" | "request") {
  if (storeCode === "MAIN") {
    return access === "read" ? "store.stock.read"
      : access === "request" ? "store.requests.submit" : "store.asset_movement.write"
  }
  if (storeCode === "QUALITY") return `quality.store.${access}`
  const floor = productionFloors.find(({ code }) => code === storeCode)
  if (!floor) throw new Error("Accountable Store is invalid.")
  return departmentStoreCapability(floor.code, access)
}

export function accountableStoreHref(storeCode: string) {
  if (storeCode === "MAIN") return "/store/movement"
  if (storeCode === "QUALITY") return "/quality-control/store"
  const floor = productionFloors.find(({ code }) => code === storeCode)
  if (!floor) throw new Error("Accountable Store is invalid.")
  return departmentStoreHref(floor.code)
}

export const departmentStorePageAccess = productionFloors.map((floor) => ({
  href: departmentStoreHref(floor.code),
  id: `production.${floor.code}.store`,
  label: "Store",
  module: floor.label,
  navigation: true,
  readPermissionKey: departmentStoreCapability(floor.code, "read"),
  writePermissionKey: departmentStoreCapability(floor.code, "write"),
  submodule: "Store",
})) satisfies PageAccessDefinition[]
