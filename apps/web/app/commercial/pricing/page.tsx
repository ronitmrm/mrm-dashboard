import Link from "next/link"
import { redirect } from "next/navigation"

import { createCommercialCostingRepository } from "@workspace/db"
import { Button } from "@workspace/ui/components/button"
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
import { commercialCapabilities } from "@/lib/auth/commercial-capabilities"
import {
  listGrantedCapabilities,
  requireAuthenticatedSession,
} from "@/lib/auth/require-capability"

import { PricingTable } from "./pricing-table"
import { ProductPricingView } from "./product-pricing-view"

export const dynamic = "force-dynamic"

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string | string[]
    view?: string | string[]
  }>
}) {
  const session = await requireAuthenticatedSession("/commercial/pricing")
  const grantedCapabilities = new Set(
    await listGrantedCapabilities(session.user.id, [
      commercialCapabilities.products.read,
      commercialCapabilities.pricing.read,
    ])
  )
  const canReadProductPricing = grantedCapabilities.has(
    commercialCapabilities.products.read
  )
  const canReadCustomerPricing = grantedCapabilities.has(
    commercialCapabilities.pricing.read
  )
  if (!canReadProductPricing && !canReadCustomerPricing) {
    redirect("/unauthorized")
  }

  const params = await searchParams
  const requestedView = Array.isArray(params.view)
    ? params.view[0]
    : params.view
  const showCustomerPricing =
    (requestedView === "customer" && canReadCustomerPricing) ||
    !canReadProductPricing
  if (!showCustomerPricing) {
    return (
      <ProductPricingView
        searchParams={searchParams}
        showCustomerPricingLink={canReadCustomerPricing}
      />
    )
  }

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
          <CardTitle>Customer Pricing</CardTitle>
          <CardAction>
            <div className="flex items-center gap-2">
              {canReadProductPricing ? (
                <Button asChild size="sm" variant="outline">
                  <Link href="/commercial/pricing?view=products">
                    Product Base Pricing
                  </Link>
                </Button>
              ) : null}
              <DataDownloadButton href="/commercial/pricing/export.xlsx" />
            </div>
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
