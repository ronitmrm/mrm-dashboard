import { renderDepartmentStoreWorkspace } from "@/lib/department-store-workspace"

export default async function StoreDepartmentTransfersPage({ searchParams }: {
  searchParams: Promise<{ saved?: string }>
}) {
  return renderDepartmentStoreWorkspace({
    basePath: "/store/department-transfers",
    readCapability: "store.stock.read",
    saved: (await searchParams).saved === "1",
    storeCode: "MAIN",
    writeCapability: "store.asset_movement.write",
  })
}
