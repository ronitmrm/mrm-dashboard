import { createProductPortfolioRepository } from "@workspace/db"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"

import { ProductPortfolioTable } from "./product-portfolio-table"

const portfolioPath = "/commercial/products"

export async function ProductPortfolioPage({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string }>
}) {
  await requireCapability("pricing.products.read", portfolioPath)
  const { customer } = await searchParams
  const customerUid = customer?.trim() ?? ""
  const repository = createProductPortfolioRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const rows = await repository
    .listForOrganization("MRMPL", { customerUid })
    .finally(() => repository.close())

  return (
    <div className="grid gap-6">
      <section>
        <h2 className="text-2xl font-semibold tracking-tight text-balance">
          Product Portfolio
        </h2>
        <p className="mt-1 text-sm text-pretty text-muted-foreground">
          Ordered Products Across All Customers
          {customerUid ? `, Plus Quoted Products For ${customerUid}` : ""}.
        </p>
      </section>

      <Card className="min-h-[70svh]">
        <CardHeader>
          <CardTitle>Current Product Portfolio</CardTitle>
          <CardDescription>
            Read-Only Product Identity And Classification For Design Work.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col">
          <ProductPortfolioTable rows={rows} />
        </CardContent>
      </Card>
    </div>
  )
}
