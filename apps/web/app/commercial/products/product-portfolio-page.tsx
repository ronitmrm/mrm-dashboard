import { createProductPortfolioRepository } from "@workspace/db"
import {
  SectionCard,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { PageHeader } from "@/components/ui/golden-patterns"
import { requireCapability } from "@/lib/auth/require-capability"

import { ProductPortfolioTable } from "./product-portfolio-table"
import Link from "next/link"
import { Button } from "@workspace/ui/components/button"
import { listGrantedCapabilities } from "@/lib/auth/require-capability"
import { commercialTaskCapabilities } from "@/lib/auth/task-capabilities"

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
  const session = await requireCapability("pricing.products.read", portfolioPath)
  const canCreate = (await listGrantedCapabilities(session.user.id, [commercialTaskCapabilities.saveDesign])).includes(commercialTaskCapabilities.saveDesign)
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
      <PageHeader
        title="Product Portfolio"
        actions={canCreate && !selection ? <Button asChild><Link href="/commercial/products/new">Add Product</Link></Button> : undefined}
        description={
          <>
            Permanent Internal Products
            {customerUid ? `, Plus Quoted Products For ${customerUid}` : ""}.
          </>
        }
      />

      <SectionCard className="min-h-[70svh]">
        <CardHeader>
          <CardTitle>Current Product Portfolio</CardTitle>
          <CardDescription>
            {selection
              ? selection.lineIndex === undefined
                ? "Filter the columns and select a Product for this Design task."
                : "Choose one Product to return it to the selected Design BOM line."
              : "Product identity, classification and directly registered parts."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col">
          <ProductPortfolioTable rows={rows} selection={selection} />
        </CardContent>
      </SectionCard>
    </div>
  )
}
