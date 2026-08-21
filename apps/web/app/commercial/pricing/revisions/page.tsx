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

import { PricingTable } from "../pricing-table"

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

  return (
    <Card>
      <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle>
            {code ? "Price revisions — " + code : "Price Revisions"}
          </CardTitle>
          <CardDescription>
            Every Retained Quote Revision And Its Historical Snapshot Tree.
          </CardDescription>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href={"/commercial/pricing/revisions/export.xlsx" + query}>
              Export Excel
            </Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/commercial/pricing">Back To Pricing</Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <PricingTable
          filterStorageKey="mrmpl:commercial:pricing-revisions:filters:v1"
          revisionLinks={false}
          rows={rows}
        />
      </CardContent>
    </Card>
  )
}
