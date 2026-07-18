import { CostingCalculator } from "@/components/commercial/costing-calculator"
import { requireCapability } from "@/lib/auth/require-capability"

export const dynamic = "force-dynamic"

export default async function CostingPage() {
  await requireCapability("pricing.costing.read", "/commercial/costing")

  return <CostingCalculator />
}
