import Link from "next/link"
import { ClipboardCheck } from "lucide-react"
import { notFound } from "next/navigation"
import {
  parseProductionFloorCode,
  productionFloors,
} from "@workspace/db/production-floors"
import { Button } from "@workspace/ui/components/button"
import { CommercialShell } from "@/components/commercial/commercial-shell"
import { PageHeader } from "@/components/ui/golden-patterns"
import { OrderAcceptanceWorkspace } from "@/components/order-acceptance-workspace"
import {
  requireCapability,
  listGrantedCapabilities,
} from "@/lib/auth/require-capability"
import { getUnifiedNavigationAccess } from "@/lib/auth/unified-navigation-access"
import { productionFloorPageCapability } from "@/lib/auth/production-floor-capabilities"
import { productionFloorTaskCapability } from "@/lib/auth/production-floor-task-capabilities"

export const dynamic = "force-dynamic"
export default async function OrderAcceptancePage({
  searchParams,
}: {
  searchParams: Promise<{ floor?: string }>
}) {
  const floor = parseProductionFloorCode((await searchParams).floor)
  if (!floor) notFound()
  const session = await requireCapability(
    productionFloorPageCapability(floor, "productionControlTab"),
    `/order-acceptance?floor=${floor}`
  )
  const capability = productionFloorTaskCapability(floor, "order_acceptance")
  const [access, granted] = await Promise.all([
    getUnifiedNavigationAccess(session.user.id),
    listGrantedCapabilities(session.user.id, [capability]),
  ])
  return (
    <CommercialShell
      navigationAccess={access}
      user={{ email: session.user.email, name: session.user.name }}
    >
      <div className="grid min-w-0 gap-5">
        <PageHeader
          title="Order Acceptance Planning"
          icon={ClipboardCheck}
          description={`${productionFloors.find((item) => item.code === floor)?.label} — Proposed Orders`}
          actions={
            <Button variant="outline" asChild>
              <Link href={`/?tab=productionControlTab&floor=${floor}`}>
                Back to Planner Actions
              </Link>
            </Button>
          }
        />
        <OrderAcceptanceWorkspace
          floor={floor}
          canWrite={granted.includes(capability)}
        />
      </div>
    </CommercialShell>
  )
}
