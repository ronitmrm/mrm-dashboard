import { createProductPortfolioRepository } from "@workspace/db"
import {
  SectionCard,
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
  searchParams: Promise<{
    customer?: string
    returnTo?: string
    selectLine?: string
    selectTask?: string
  }>
}) {
  await requireCapability("pricing.products.read", portfolioPath)
  const { customer, returnTo, selectLine, selectTask } = await searchParams
  // Root Design matches must be ordered internal Products, as enforced on save.
  const customerUid = selectTask === "1" ? "" : (customer?.trim() ?? "")
  const lineIndex = Number(selectLine)
  const selection =
    returnTo && /^\/commercial\/design\/[^/?#]+\/new$/.test(returnTo)
      ? selectTask === "1"
        ? { returnTo }
        : Number.isInteger(lineIndex) && lineIndex >= 0
          ? { lineIndex, returnTo }
          : undefined
      : undefined
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

      <SectionCard className="min-h-[70svh]">
        <CardHeader>
          <CardTitle>Current Product Portfolio</CardTitle>
          <CardDescription>
            {selection
              ? selection.lineIndex === undefined
                ? "Filter the columns and select a Product for this Design task."
                : "Choose one Product to return it to the selected Design BOM line."
              : "Read-Only Product Identity And Classification For Design Work."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col">
          <ProductPortfolioTable rows={rows} selection={selection} />
        </CardContent>
      </SectionCard>
    </div>
  )
}
