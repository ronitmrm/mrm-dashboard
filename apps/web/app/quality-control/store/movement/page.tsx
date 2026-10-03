import { renderDepartmentStoreWorkspace } from "@/lib/department-store-workspace"

export default async function QualityStoreMovementPage({ searchParams }: {
  searchParams: Promise<{ saved?: string }>
}) {
  const query = await searchParams
  return renderDepartmentStoreWorkspace({
    basePath: "/quality-control/store",
    readCapability: "quality.store.read",
    saved: query.saved === "1",
    storeCode: "QUALITY",
    view: "movement",
    writeCapability: "quality.store.write",
  })
}
