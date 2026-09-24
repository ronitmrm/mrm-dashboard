import { normalizeProductionFloorCode } from "@workspace/db/production-floors"

import { ProductionBreakSchedule } from "@/components/production-break-schedule"
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
  const canManage = (await listGrantedCapabilities(session.user.id, [
    masterCapability("production_break_schedule", "save", floor),
  ])).length > 0 && view !== "masterTables"
  return <ProductionBreakSchedule canManage={canManage} floor={floor} />
}
