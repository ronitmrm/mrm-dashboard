import { renderDepartmentStoreWorkspace } from "@/lib/department-store-workspace"

export default async function QualityStorePage({ searchParams }: {
  searchParams: Promise<{ saved?: string }>
}) {
  return renderDepartmentStoreWorkspace({
    basePath: "/quality-control/store",
    readCapability: "quality.store.read",
    saved: (await searchParams).saved === "1",
    storeCode: "QUALITY",
    writeCapability: "quality.store.write",
  })
}
