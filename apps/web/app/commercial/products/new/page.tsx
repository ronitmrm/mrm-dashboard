import Link from "next/link"
import { createCommercialWorkflowRepository } from "@workspace/db"
import { Button } from "@workspace/ui/components/button"
import { PageHeader } from "@/components/ui/golden-patterns"
import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"
import { commercialTaskCapabilities } from "@/lib/auth/task-capabilities"
import { PortfolioEntryForm } from "./portfolio-entry-form"

export default async function NewPortfolioProductPage() {
  await requireCapability(
    commercialTaskCapabilities.saveDesign,
    "/commercial/products/new"
  )
  const repository = createCommercialWorkflowRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const options = await repository
    .getDesignWorkspaceOptions("MRMPL")
    .finally(() => repository.close())
  return (
    <div className="grid gap-6">
      <PageHeader
        title="Add Product to Portfolio"
        description="Enter product details and BOM independently of customer quotations."
        actions={
          <Button asChild variant="outline">
            <Link href="/commercial/products">Back to Portfolio</Link>
          </Button>
        }
      />
      <PortfolioEntryForm options={options} />
    </div>
  )
}
