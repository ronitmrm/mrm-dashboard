import Link from "next/link"

import type { ProductPortfolioDossier } from "@workspace/db"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
 SectionCard,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
 OperationalTable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

function display(value: number | string | null | undefined) {
  return value === null || value === undefined || value === "" ? "—" : value
}

function grams(value: number | null) {
  return value === null ? "Not captured" : `${value} g`
}

export function ProductDesignSummary({
  dossier,
  historical = false,
}: {
  dossier: ProductPortfolioDossier
  historical?: boolean
}) {
  return (
    <div className="grid gap-6">
      <div className="grid gap-4 lg:grid-cols-3">
 <SectionCard className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Product Definition</CardTitle>
            <CardDescription>{dossier.description}</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <dt className="text-muted-foreground">Classification</dt>
                <dd>{dossier.itemType}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Product Size</dt>
                <dd>{display(dossier.productSize)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Category</dt>
                <dd>{display(dossier.category)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Subcategory</dt>
                <dd>{display(dossier.subCategory)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Product Type</dt>
                <dd>{display(dossier.productType)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Production Type</dt>
                <dd>{display(dossier.productionType)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Product Weight</dt>
                <dd>{grams(dossier.productWeight)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Blank-piece Weight</dt>
                <dd>{grams(dossier.blankPieceWeight)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Rod Size</dt>
                <dd>{display(dossier.rodSize)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Rod Type</dt>
                <dd>{display(dossier.rodType)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Die Code</dt>
                <dd>{display(dossier.dieCode)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Processes</dt>
                <dd>{dossier.processesRequired.join(", ") || "None"}</dd>
              </div>
            </dl>
          </CardContent>
 </SectionCard>
 <SectionCard>
          <CardHeader>
            <CardTitle>Released Control</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <div>
              Design Revision: <Badge>{dossier.design?.revision || "—"}</Badge>
            </div>
            <div>Status: {dossier.design?.status || "Unreleased"}</div>
            <div>Current Drawing: {dossier.drawing?.number || "—"}</div>
            <div>Drawing Revision: {dossier.drawing?.revision || "—"}</div>
            {!historical ? (
              <div className="flex flex-wrap gap-2 pt-2">
                <Button asChild size="sm">
                  <Link
                    href={`/commercial/products/${encodeURIComponent(dossier.uid)}/design`}
                  >
                    Open Complete Design Task
                  </Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link
                    href={`/commercial/drawing-history/${encodeURIComponent(dossier.uid)}`}
                  >
                    Drawing History
                  </Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link href="/commercial/ecns">Raise ECN</Link>
                </Button>
              </div>
            ) : null}
          </CardContent>
 </SectionCard>
      </div>

 <SectionCard>
        <CardHeader>
          <CardTitle>
            {historical ? "Historical BOM Summary" : "Current BOM Summary"}
          </CardTitle>
          <CardDescription>
            {historical
              ? "Frozen revision evidence only. Fields not captured at release are marked unavailable."
              : "Design-only recursive structure. Quantities are shown per parent and rolled up from the root."}
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
 <OperationalTable>
            <TableHeader>
              <TableRow>
                <TableHead>Level</TableHead>
                <TableHead>Parent</TableHead>
                <TableHead>Component</TableHead>
                <TableHead>Component Revision</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Qty.</TableHead>
                <TableHead>Total Qty.</TableHead>
                <TableHead>Weight</TableHead>
                <TableHead>Blank Weight</TableHead>
                <TableHead>Rod</TableHead>
                <TableHead>Product Type</TableHead>
                <TableHead>Production Type</TableHead>
                <TableHead>Processes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dossier.bom.length ? (
                dossier.bom.map((line, index) => (
                  <TableRow
                    key={`${line.parentUid}-${line.componentUid}-${index}`}
                  >
                    <TableCell>{line.depth}</TableCell>
                    <TableCell className="font-mono">
                      {line.parentUid}
                    </TableCell>
                    <TableCell className="font-mono">
                      <Link
                        className="font-medium text-primary underline-offset-4 hover:underline"
                        href={`/commercial/products/${encodeURIComponent(line.componentUid)}`}
                      >
                        {line.componentUid}
                      </Link>
                    </TableCell>
                    <TableCell>{display(line.designRevision)}</TableCell>
                    <TableCell>{line.description}</TableCell>
                    <TableCell>{line.itemType}</TableCell>
                    <TableCell>{line.quantity}</TableCell>
                    <TableCell>{line.totalQuantity}</TableCell>
                    <TableCell>{grams(line.weight)}</TableCell>
                    <TableCell>{grams(line.blankPieceWeight)}</TableCell>
                    <TableCell>
                      {[line.rodSize, line.rodType]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </TableCell>
                    <TableCell>{display(line.productType)}</TableCell>
                    <TableCell>{display(line.productionType)}</TableCell>
                    <TableCell>
                      {line.processesRequired.join(", ") || "None"}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={14}>
                    No component lines. This Product is a BOM leaf.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
 </OperationalTable>
        </CardContent>
 </SectionCard>

      {!historical ? (
 <SectionCard>
          <CardHeader>
            <CardTitle>Design Revision History</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
 <OperationalTable>
              <TableHeader>
                <TableRow>
                  <TableHead>Revision</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Effective</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>ECN</TableHead>
                  <TableHead>Approved By</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {dossier.revisionHistory.map((revision) => (
                  <TableRow key={revision.revision}>
                    <TableCell>
                      <Badge variant={revision.current ? "default" : "outline"}>
                        {revision.revision}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {revision.current ? "Current" : revision.status}
                    </TableCell>
                    <TableCell>{revision.effectiveOn || "—"}</TableCell>
                    <TableCell>{revision.changeReason}</TableCell>
                    <TableCell>
                      {revision.ecnNumber || "Initial Release"}
                    </TableCell>
                    <TableCell>{revision.approvedBy || "—"}</TableCell>
                    <TableCell className="text-right">
                      <Button asChild size="sm" variant="outline">
                        <Link
                          href={
                            revision.current
                              ? `/commercial/products/${encodeURIComponent(dossier.uid)}/design`
                              : `/commercial/products/${encodeURIComponent(dossier.uid)}/revisions/${revision.revision}`
                          }
                        >
                          {revision.current
                            ? "Open Design Task"
                            : "Open Summary"}
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
 </OperationalTable>
          </CardContent>
 </SectionCard>
      ) : null}
    </div>
  )
}
