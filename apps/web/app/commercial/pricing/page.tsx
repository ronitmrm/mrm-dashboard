import { createCommercialCostingRepository } from "@workspace/db"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import Link from "next/link"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"

import { PricingTable } from "./pricing-table"

export const dynamic = "force-dynamic"

export default async function PricingPage() {
  await requireCapability("pricing.pricing.read", "/commercial/pricing")
  const repository = createCommercialCostingRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const rows = await repository
    .listPricingRegister("MRMPL")
    .finally(() => repository.close())

  return (
    <Card>
      <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle>Pricing</CardTitle>
          <CardDescription>
            Current Customer Prices With Immutable Product/Calculation Snapshots
            And Recursive Bom Rows.
          </CardDescription>
        </div>
        <Button asChild variant="outline">
          <Link href="/commercial/pricing/export.xlsx">Export Excel</Link>
        </Button>
      </CardHeader>
      <CardContent>
        <PricingTable rows={rows} />
      </CardContent>
    </Card>
  )
}
