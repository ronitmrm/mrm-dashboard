import { createCommercialCostingRepository } from "@workspace/db"
import { Button } from "@workspace/ui/components/button"
import {
 SectionCard,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import Link from "next/link"

import { DataDownloadButton } from "@/components/data-download-button"
import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"

import { PricingTable } from "../pricing-table"
import { orderPricingRows, toPricingViewRow } from "../pricing-workbook"

export const dynamic = "force-dynamic"

export default async function PricingRevisionsPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; customer?: string }>
}) {
  await requireCapability(
    "pricing.pricing.read",
    "/commercial/pricing/revisions"
  )
  const { code = "", customer = "" } = await searchParams
  const customerPartCode = code.trim()
  const repository = createCommercialCostingRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const rows = await (async () => {
    try {
      return customerPartCode
        ? await repository.listPricingRevisionHistory("MRMPL", {
            customerId: customer,
            customerPartCode,
          })
        : []
    } finally {
      await repository.close()
    }
  })()
  const query =
    "?customer=" +
    encodeURIComponent(customer) +
    "&code=" +
    encodeURIComponent(code)
  const tableRows = orderPricingRows(rows).map((row) => ({
    customerId: row.customerId,
    rowKey: row.rowKey,
    values: toPricingViewRow(row),
  }))

  return (
 <SectionCard>
      <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle>
            {code ? "Price revisions — " + code : "Price Revisions"}
          </CardTitle>
        </div>
        <div className="flex gap-2">
          <DataDownloadButton
            href={"/commercial/pricing/revisions/export.xlsx" + query}
          />
          <Button asChild variant="secondary">
            <Link href="/commercial/pricing">Back To Pricing</Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <PricingTable
          filterStorageKey="mrmpl:commercial:pricing-revisions:filters:v1"
          revisionLinks={false}
          rows={tableRows}
        />
      </CardContent>
 </SectionCard>
  )
}
