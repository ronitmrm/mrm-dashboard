import { createCommercialCostingRepository } from "@workspace/db"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import Link from "next/link"

import { BoundedResultNotice } from "@/components/bounded-result-notice"
import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"

import { PricingTable } from "./pricing-table"

export const dynamic = "force-dynamic"

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  await requireCapability("pricing.pricing.read", "/commercial/pricing")
  const { q = "" } = await searchParams
  const query = q.trim()
  const repository = createCommercialCostingRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const pricing = await repository
    .listPricingRegisterBounded("MRMPL", { query })
    .finally(() => repository.close())
  const exportQuery = query ? `?q=${encodeURIComponent(query)}` : ""

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Pricing</CardTitle>
            <CardDescription>
              Current Customer Prices With Immutable Product/Calculation
              Snapshots And Recursive Bom Rows.
            </CardDescription>
          </div>
          <Button asChild variant="outline">
            <Link href={`/commercial/pricing/export.xlsx${exportQuery}`}>
              Export Excel
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="grid gap-4">
          <form className="flex max-w-2xl gap-2" method="get">
            <Input
              aria-label="Search pricing"
              defaultValue={query}
              name="q"
              placeholder="Search customer, customer part, quote, or product UID"
            />
            <Button type="submit" variant="outline">
              Search
            </Button>
          </form>
          <BoundedResultNotice
            actionHref={`/commercial/pricing/export.xlsx${exportQuery}`}
            actionLabel="Export every matching price"
            coverage={pricing.coverage}
            searchQuery={query}
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
