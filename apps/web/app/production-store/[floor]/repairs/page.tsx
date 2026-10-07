import { notFound } from "next/navigation"
import { productionFloors } from "@workspace/db/production-floors"

import { departmentStoreCapability, departmentStoreHref } from "@/lib/auth/department-store-capabilities"
import { renderDepartmentStoreWorkspace } from "@/lib/department-store-workspace"

export default async function ProductionStoreRepairsPage({ params, searchParams }: {
  params: Promise<{ floor: string }>
  searchParams: Promise<{ saved?: string }>
}) {
  const requestedFloor = (await params).floor
  const floor = productionFloors.find(({ code }) => code === requestedFloor)
  if (!floor) notFound()
  return renderDepartmentStoreWorkspace({
    basePath: departmentStoreHref(floor.code),
    readCapability: departmentStoreCapability(floor.code, "read"),
    saved: (await searchParams).saved === "1",
    storeCode: floor.code,
    view: "repairs",
    writeCapability: departmentStoreCapability(floor.code, "write"),
  })
}
