import { createCommercialCostingRepository } from "@workspace/db"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import Link from "next/link"

import { BoundedResultNotice } from "@/components/bounded-result-notice"
import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"

import { PricingTable } from "./pricing-table"

export const dynamic = "force-dynamic"

export default async function PricingPage() {
  await requireCapability("pricing.pricing.read", "/commercial/pricing")
  const repository = createCommercialCostingRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const pricing = await repository
    .listPricingRegisterBounded("MRMPL")
    .finally(() => repository.close())

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Pricing</CardTitle>
          <CardDescription>
            Current Customer Prices With Immutable Product/Calculation
            Snapshots And Recursive Bom Rows.
          </CardDescription>
          <CardAction>
            <Button asChild size="sm" variant="outline">
              <Link href="/commercial/pricing/export.xlsx">Export Excel</Link>
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="grid gap-4">
          <BoundedResultNotice
            actionHref="/commercial/pricing/export.xlsx"
            actionLabel="Export every matching price"
            coverage={pricing.coverage}
            section="Current pricing register"
          />
          <PricingTable
            filterStorageKey="mrmpl:commercial:pricing:filters:v1"
            rows={pricing.rows}
          />
        </CardContent>
      </Card>
    </div>
  )
}
