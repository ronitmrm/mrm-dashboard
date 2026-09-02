import Link from "next/link"
import { notFound } from "next/navigation"

import { createProductPortfolioRepository } from "@workspace/db"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"

export const dynamic = "force-dynamic"

function money(value: number) {
  return new Intl.NumberFormat("en-IN", {
    currency: "INR",
    maximumFractionDigits: 4,
    style: "currency",
  }).format(value)
}

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
            Released design, BOM, drawing, pricing, and ECN evidence.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/commercial/products">Back to Portfolio</Link>
        </Button>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Identity</CardTitle>
            <CardDescription>{dossier.description}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <div>Type: {dossier.itemType}</div>
            <div>Production: {dossier.productType || "—"}</div>
            <div>
              Processes: {dossier.processesRequired.join(", ") || "None"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Released Design</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <div>
              Revision: <Badge>{dossier.design?.revision || "—"}</Badge>
            </div>
            <div>Status: {dossier.design?.status || "Unreleased"}</div>
            <div>
              Released: {dossier.design?.releasedAt?.toLocaleString() || "—"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Current Drawing</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <div>Number: {dossier.drawing?.number || "—"}</div>
            <div>Revision: {dossier.drawing?.revision || "—"}</div>
            <div>Status: {dossier.drawing?.status || "Not Released"}</div>
            <Button asChild size="sm" variant="outline">
              <Link href={`/commercial/drawing-history/${dossier.uid}`}>
                Drawing History
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Released BOM Hierarchy</CardTitle>
          <CardDescription>Read-only recursive Product structure.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Level</TableHead>
                <TableHead>Parent</TableHead>
                <TableHead>Component</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Quantity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dossier.bom.length ? (
                dossier.bom.map((line, index) => (
                  <TableRow key={`${line.parentUid}-${line.componentUid}-${index}`}>
                    <TableCell>{line.depth}</TableCell>
                    <TableCell className="font-mono">{line.parentUid}</TableCell>
                    <TableCell className="font-mono">{line.componentUid}</TableCell>
                    <TableCell>{line.description}</TableCell>
                    <TableCell>{line.quantity}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5}>No component lines.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Pricing Summary</CardTitle>
            <CardDescription>
              Current cost; editable only from Product Costing.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <div className="font-semibold">
              Product Cost: {money(dossier.pricing.productCostInr)}
            </div>
            {Object.entries(dossier.pricing.processes)
              .filter(([process]) => dossier.processesRequired.includes(process))
              .map(([process, value]) => (
                <div className="flex justify-between" key={process}>
                  <span>{process}</span>
                  <span>{money(value)}</span>
                </div>
              ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Latest ECN</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <div>Number: {dossier.latestEcn?.number || "—"}</div>
            <div>Status: {dossier.latestEcn?.status || "No ECN"}</div>
            <div>Reason: {dossier.latestEcn?.reason || "—"}</div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
