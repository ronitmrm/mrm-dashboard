import { renderDepartmentStoreWorkspace } from "@/lib/department-store-workspace"

export default async function QualityStoreRepairsPage({ searchParams }: {
  searchParams: Promise<{ saved?: string }>
}) {
  return renderDepartmentStoreWorkspace({
    basePath: "/quality-control/store",
    readCapability: "quality.store.read",
    saved: (await searchParams).saved === "1",
    storeCode: "QUALITY",
    view: "repairs",
    writeCapability: "quality.store.write",
  })
}
