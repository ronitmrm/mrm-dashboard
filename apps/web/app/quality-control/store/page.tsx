import { departmentStoreAction, renderDepartmentStoreWorkspace } from "@/lib/department-store-workspace"

export default async function QualityStorePage({ searchParams }: {
  searchParams: Promise<{ action?: string; item_type_id?: string | string[]; saved?: string; select?: string }>
}) {
  const query = await searchParams
  return renderDepartmentStoreWorkspace({
    action: departmentStoreAction(query.action),
    basePath: "/quality-control/store",
    readCapability: "quality.store.read",
    saved: query.saved === "1",
    selectedItemIds: Array.isArray(query.item_type_id) ? query.item_type_id
      : query.item_type_id ? [query.item_type_id] : [],
    selectUse: query.select === "use",
    storeCode: "QUALITY",
    writeCapability: "quality.store.write",
  })
}
