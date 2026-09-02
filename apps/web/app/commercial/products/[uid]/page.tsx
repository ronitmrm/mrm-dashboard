import Link from "next/link"
import { notFound } from "next/navigation"

import { createProductPortfolioRepository } from "@workspace/db"
import { Button } from "@workspace/ui/components/button"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"

import { ProductDesignSummary } from "../product-design-summary"

export const dynamic = "force-dynamic"

export default async function ProductDossierPage({
  params,
}: {
  params: Promise<{ uid: string }>
}) {
  const { uid } = await params
  const path = `/commercial/products/${encodeURIComponent(uid)}`
  await requireCapability("pricing.products.read", path)
  const repository = createProductPortfolioRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const dossier = await repository
    .getDossierForOrganization("MRMPL", uid)
    .finally(() => repository.close())
  if (!dossier) notFound()

  return (
    <div className="grid gap-6">
      <section className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs text-muted-foreground" translate="no">
            {dossier.uid}
          </p>
          <h2 className="text-2xl font-semibold tracking-tight">
            Product Design Dossier
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Design-only Product definition, recursive BOM, drawings, and
            revision evidence.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/commercial/products">Back to Portfolio</Link>
        </Button>
      </section>

      <ProductDesignSummary dossier={dossier} />
    </div>
  )
}
