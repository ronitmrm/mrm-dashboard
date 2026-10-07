import { notFound } from "next/navigation"
import { productionFloors } from "@workspace/db/production-floors"

import { departmentStoreCapability, departmentStoreHref } from "@/lib/auth/department-store-capabilities"
import { departmentStoreAction, renderDepartmentStoreWorkspace } from "@/lib/department-store-workspace"

export default async function ProductionStorePage({
  params,
  searchParams,
}: {
  params: Promise<{ floor: string }>
  searchParams: Promise<{ action?: string; item_type_id?: string | string[]; saved?: string; select?: string }>
}) {
  const requested = (await params).floor
  const floor = productionFloors.find(({ code }) => code === requested)
  if (!floor) notFound()
  const query = await searchParams
  return renderDepartmentStoreWorkspace({
    action: departmentStoreAction(query.action),
    basePath: departmentStoreHref(floor.code),
    readCapability: departmentStoreCapability(floor.code, "read"),
    saved: query.saved === "1",
    selectedItemIds: Array.isArray(query.item_type_id) ? query.item_type_id
      : query.item_type_id ? [query.item_type_id] : [],
    selectMode: query.select === "use" || query.select === "repair" || query.select === "calibration"
      ? query.select : undefined,
    storeCode: floor.code,
    writeCapability: departmentStoreCapability(floor.code, "write"),
  })
}
