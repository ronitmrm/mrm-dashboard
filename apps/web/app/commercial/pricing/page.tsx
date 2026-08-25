import { createCommercialCostingRepository } from "@workspace/db"
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

import { BoundedResultNotice } from "@/components/bounded-result-notice"
import { DataDownloadButton } from "@/components/data-download-button"
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
          <CardAction>
            <DataDownloadButton href="/commercial/pricing/export.xlsx" />
          </CardAction>
        </CardHeader>
        <CardContent className="grid gap-4">
          <BoundedResultNotice
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
