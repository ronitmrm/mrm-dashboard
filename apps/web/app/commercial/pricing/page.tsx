import { createCommercialCostingRepository } from "@workspace/db"
import {
 SectionCard,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

import { DataDownloadButton } from "@/components/data-download-button"
import { FullPageWorkspace } from "@/components/full-page-workspace"
import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"

import { PricingTable } from "./pricing-table"
import { orderPricingRows, toPricingViewRow } from "./pricing-workbook"

export const dynamic = "force-dynamic"

export default async function PricingPage() {
  await requireCapability("pricing.pricing.read", "/commercial/pricing")
  const repository = createCommercialCostingRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const rows = await repository
    .listPricingRegisterForExport("MRMPL")
    .finally(() => repository.close())

  const tableRows = orderPricingRows(rows).map((row) => ({
    customerId: row.customerId,
    rowKey: row.rowKey,
    values: toPricingViewRow(row),
  }))

  return (
    <FullPageWorkspace className="h-[calc(100svh-var(--header-height))] grid-rows-[minmax(0,1fr)] content-stretch overflow-hidden">
 <SectionCard className="min-h-0">
        <CardHeader className="shrink-0">
          <CardTitle>Pricing</CardTitle>
          <CardAction>
            <DataDownloadButton href="/commercial/pricing/export.xlsx" />
          </CardAction>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col">
          <PricingTable
            filterStorageKey="mrmpl:commercial:pricing:filters:v2"
            rows={tableRows}
          />
        </CardContent>
 </SectionCard>
    </FullPageWorkspace>
  )
}
