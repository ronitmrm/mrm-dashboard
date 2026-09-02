import Link from "next/link"
import { notFound } from "next/navigation"

import { createProductPortfolioRepository } from "@workspace/db"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"

import { ProductDesignSummary } from "../../../product-design-summary"

export const dynamic = "force-dynamic"

export default async function HistoricalProductDesignRevisionPage({
  params,
}: {
  params: Promise<{ revision: string; uid: string }>
}) {
  const { revision, uid } = await params
  const productPath = `/commercial/products/${encodeURIComponent(uid)}`
  const path = `${productPath}/revisions/${encodeURIComponent(revision)}`
  await requireCapability("pricing.products.read", path)

  const repository = createProductPortfolioRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const dossier = await repository
    .getDesignRevisionSummaryForOrganization("MRMPL", uid, revision)
    .finally(() => repository.close())
  if (!dossier) notFound()

  return (
    <div className="grid gap-6">
      <section className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-2">
          <Button asChild className="w-fit" size="sm" variant="ghost">
            <Link href={productPath}>Back to Current Product Dossier</Link>
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-semibold tracking-tight">
              {dossier.uid} · Historical BOM Summary
            </h2>
            <Badge variant="outline">Revision {revision}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Immutable Product and BOM evidence captured when this revision was
            released. This screen is read-only.
          </p>
        </div>
      </section>

      <ProductDesignSummary dossier={dossier} historical />
    </div>
  )
}
