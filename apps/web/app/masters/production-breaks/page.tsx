import { normalizeProductionFloorCode } from "@workspace/db/production-floors"

import { ProductionBreakSchedule } from "@/components/production-break-schedule"
import { MasterDataViewTabs } from "@/components/master-data-view-tabs"
import { masterCapability } from "@/lib/auth/master-capabilities"
import { listGrantedCapabilities, requireCapability } from "@/lib/auth/require-capability"

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ floor?: string | string[]; masterView?: string | string[] }>
}) {
  const query = await searchParams
  const view = Array.isArray(query.masterView) ? query.masterView[0] : query.masterView
  const floor = normalizeProductionFloorCode(
    Array.isArray(query.floor) ? query.floor[0] : query.floor
  )
  const session = await requireCapability(
    masterCapability("production_break_schedule", "read", floor),
    `/masters/production-breaks?floor=${floor}`
  )
  const activeView = view === "masterTables" ? "masterTables" : "dataEntry"
  const canManage = (await listGrantedCapabilities(session.user.id, [
    masterCapability("production_break_schedule", "save", floor),
  ])).length > 0 && view !== "masterTables"
  const context = `floor=${floor}&masterUnit=${floor}&masterMain=production_break_schedule&masterSub=production_break_schedule`
  return <section className="grid gap-4">
    <MasterDataViewTabs
      activeView={activeView}
      dataEntryHref={`/masters/production-breaks?masterView=dataEntry&${context}`}
      masterTablesHref={`/masters/production-breaks?masterView=masterTables&${context}`}
    />
    <ProductionBreakSchedule canManage={canManage} floor={floor} />
  </section>
}
