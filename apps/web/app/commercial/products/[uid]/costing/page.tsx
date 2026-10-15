import Link from "next/link"
import { notFound } from "next/navigation"
import {
  createCommercialCostingRepository,
  createPortfolioEntryRepository,
  createProductPortfolioRepository,
} from "@workspace/db"
import { Button } from "@workspace/ui/components/button"
import {
  FormSection,
  PageHeader,
  RecordDetails,
} from "@/components/ui/golden-patterns"
import { readAuthEnvironment } from "@/lib/auth/auth"
import {
  listGrantedCapabilities,
  requireCapability,
} from "@/lib/auth/require-capability"
import { commercialTaskCapabilities } from "@/lib/auth/task-capabilities"
import { ProductCostingForm } from "../../../product-costing/product-costing-form"

export default async function PortfolioCostingPage({
  params,
}: {
  params: Promise<{ uid: string }>
}) {
  const { uid } = await params
  const path = `/commercial/products/${encodeURIComponent(uid)}/costing`
  const session = await requireCapability("pricing.costing.read", path)
  const canWrite = (
    await listGrantedCapabilities(session.user.id, [
      commercialTaskCapabilities.updateProductCosting,
    ])
  ).includes(commercialTaskCapabilities.updateProductCosting)
  const connectionString = readAuthEnvironment().connectionString
  const entries = createPortfolioEntryRepository({ connectionString })
  const costing = createCommercialCostingRepository({ connectionString })
  const portfolio = createProductPortfolioRepository({ connectionString })
  const data = await (async () => {
    try {
      const entry = await entries.getEntry("MRMPL", uid)
      if (!entry) return null
      const [product, reference, dossier] = await Promise.all([
        costing.getProductCostingProduct("MRMPL", entry.id),
        costing.listProductCostingReferenceData("MRMPL"),
        portfolio.getDossierForOrganization("MRMPL", uid),
      ])
      if (!product || !dossier) return null
      const children = await Promise.all(
        dossier.bom
          .filter((line) => line.depth === 1)
          .map(async (line) => {
            const priced = await costing.getProductCostingProduct(
              "MRMPL",
              line.componentItemId
            )
            return {
              depth: 1,
              description: line.description,
              itemId: line.componentItemId,
              itemType: line.itemType,
              lifecycleStatus: priced?.lifecycleStatus ?? "P",
              lineQuantity: line.quantity,
              parentItemId: product.id,
              productCostInr: priced?.productCostInr ?? 0,
              quantity: line.quantity,
              uid: line.componentUid,
              weight100Pcs: line.weight ?? 0,
            }
          })
      )
      return { entry, product, reference, children }
    } finally {
      await Promise.all([entries.close(), costing.close(), portfolio.close()])
    }
  })()
  if (!data) notFound()
  return (
    <div className="grid gap-6">
      <PageHeader
        title={`Product Costing · ${data.product.uid}`}
        description="Product-level pricing for a directly registered Portfolio product."
        actions={
          <Button asChild variant="outline">
            <Link href={`/commercial/products/${encodeURIComponent(uid)}`}>
              Back to Product
            </Link>
          </Button>
        }
      />
      <FormSection title="Product Base">
        <RecordDetails
          items={[
            { label: "UID", value: data.product.uid },
            { label: "Status", value: data.entry.costing_status },
            {
              label: "Current Product Base (INR/pc)",
              value: new Intl.NumberFormat("en-IN", {
                maximumFractionDigits: 4,
              }).format(data.product.productCostInr),
            },
          ]}
        />
      </FormSection>
      <fieldset disabled={!canWrite}>
        <ProductCostingForm
          bomParts={data.children}
          machineTypes={data.reference.machineTypes}
          product={data.product}
          rootItemId={data.product.id}
          taskId=""
          portfolioUid={data.product.uid}
        />
      </fieldset>
    </div>
  )
}
