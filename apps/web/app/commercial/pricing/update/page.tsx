import Link from "next/link"
import { Button } from "@workspace/ui/components/button"
import { PageHeader } from "@/components/ui/golden-patterns"
import { requireCapability } from "@/lib/auth/require-capability"
import { PricingInputUpdate } from "./pricing-input-update"

export const maxDuration = 300

export default async function PricingInputUpdatePage() {
  await requireCapability("pricing.pricing.read", "/commercial/pricing/update")
  return (
    <div className="grid gap-6">
      <PageHeader
        title="Pricing Input Update"
        description="Upload inputs, review calculated prices, then apply a recorded revision."
        actions={
          <Button asChild variant="outline">
            <Link href="/commercial/pricing">Back To Pricing</Link>
          </Button>
        }
      />
      <PricingInputUpdate />
    </div>
  )
}
