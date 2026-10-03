import { departmentStoreAction, renderDepartmentStoreWorkspace } from "@/lib/department-store-workspace"

export default async function QualityStoreMovementPage({ searchParams }: {
  searchParams: Promise<{ action?: string; item_type_id?: string | string[]; saved?: string }>
}) {
  const query = await searchParams
  return renderDepartmentStoreWorkspace({
    action: departmentStoreAction(query.action),
    basePath: "/quality-control/store",
    readCapability: "quality.store.read",
    saved: query.saved === "1",
    selectedItemIds: Array.isArray(query.item_type_id) ? query.item_type_id
      : query.item_type_id ? [query.item_type_id] : [],
    storeCode: "QUALITY",
    view: "movement",
    writeCapability: "quality.store.write",
  })
}
