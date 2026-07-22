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
    "pricing.quotes.read",
    "/commercial/pricing/revisions"
  )
  const { code = "", customer = "" } = await searchParams
  const normalizedCode = code.trim().toLowerCase()
  const repository = createCommercialCostingRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const allRows = await repository
    .listPricingRegister("MRMPL", { revisions: true })
    .finally(() => repository.close())
  const rows = normalizedCode
    ? allRows.filter(
        (row) =>
          row.customerId === customer &&
          row.customerPartCode?.trim().toLowerCase() === normalizedCode
      )
    : []
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
            {code ? "Price revisions — " + code : "Price revisions"}
          </CardTitle>
          <CardDescription>
            Every retained quote revision and its historical snapshot tree.
          </CardDescription>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href={"/commercial/pricing/revisions/export.xlsx" + query}>
              Export Excel
            </Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/commercial/pricing">Back to Pricing</Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <PricingTable revisionLinks={false} rows={rows} />
      </CardContent>
    </Card>
  )
}
