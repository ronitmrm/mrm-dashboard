import Link from "next/link"
import { notFound, redirect } from "next/navigation"

import { createCommercialRevisionsRepository } from "@workspace/db"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { commercialCapabilities } from "@/lib/auth/commercial-capabilities"
import { requireCapability } from "@/lib/auth/require-capability"
import { ecnHref } from "@/lib/pricing/ecn-routes"

import { completeEngineeringChangeDesignAction } from "../../../revisions/actions"
import { EcnDesignWorkspace } from "./ecn-design-workspace"

export const dynamic = "force-dynamic"

export default async function EngineeringChangeDesignPage({
  params,
}: {
  params: Promise<{ ecnId: string }>
}) {
  const { ecnId } = await params
  await requireCapability(
    commercialCapabilities.revisions.read,
    `/commercial/ecns/${encodeURIComponent(ecnId)}/design`
  )
  const repository = createCommercialRevisionsRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const data = await (async () => {
    try {
      const [dossier, reference] = await Promise.all([
        repository.getEngineeringChangeDesignWorkspace("MRMPL", ecnId),
        repository.listEngineeringChangeReferenceData("MRMPL"),
      ])
      return { dossier, reference }
    } finally {
      await repository.close()
    }
  })()
  if (!data.dossier) notFound()
  if (data.dossier.status !== "Pending Design") redirect(ecnHref(ecnId))

  return (
    <div className="grid gap-6">
      <section className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-2 flex flex-wrap gap-2">
            <Badge variant="secondary">{data.dossier.status}</Badge>
            <Badge variant="outline">{data.dossier.itemUid}</Badge>
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">
            {data.dossier.ecnNumber} · Design
          </h2>
          <p className="text-sm text-muted-foreground">
            {data.dossier.description}
          </p>
          <p className="mt-1 text-sm">{data.dossier.reason}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href={ecnHref(ecnId)}>ECN Overview</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/commercial/ecns">ECN Register</Link>
          </Button>
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Product Design Dossier</CardTitle>
          <CardDescription>
            Revise the complete Product design. Save Draft keeps the Product
            unchanged; completion publishes the Product and BOM with locked
            before/after evidence.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={completeEngineeringChangeDesignAction}>
            <input
              name="engineering_change_note_id"
              type="hidden"
              value={data.dossier.id}
            />
            <EcnDesignWorkspace
              dossier={data.dossier}
              products={data.reference.items}
            />
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
