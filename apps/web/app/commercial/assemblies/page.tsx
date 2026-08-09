import { createProductRepository } from "@workspace/db"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { Textarea } from "@workspace/ui/components/textarea"

import { readAuthEnvironment } from "@/lib/auth/auth"
import {
  listGrantedCapabilities,
  requireCapability,
} from "@/lib/auth/require-capability"
import { BoundedResultNotice } from "@/components/bounded-result-notice"

import { addBomLineAction } from "./actions"

export const dynamic = "force-dynamic"

export default async function AssembliesPage({
  searchParams,
}: {
  searchParams: Promise<{ component?: string; parent?: string }>
}) {
  const session = await requireCapability(
    "pricing.masters.read",
    "/commercial/assemblies"
  )
  const canWrite = (
    await listGrantedCapabilities(session.user.id, ["pricing.masters.write"])
  ).includes("pricing.masters.write")
  const repository = createProductRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const params = await searchParams
  const componentSearch = params.component?.trim() ?? ""
  const parentSearch = params.parent?.trim() ?? ""
  const { componentOptions, lines, parentOptions } = await (async () => {
    try {
      return {
        componentOptions: await repository.searchForOrganization(
          "MRMPL",
          componentSearch
        ),
        lines: await repository.listBomLines("MRMPL"),
        parentOptions: await repository.searchForOrganization(
          "MRMPL",
          parentSearch,
          { itemTypes: ["Package", "Assembly"] }
        ),
      }
    } finally {
      await repository.close()
    }
  })()
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(22rem,1fr)]">
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>Assembly / BOM register</CardTitle>
          <CardDescription>
            Ordered parent/component rows used by Package and Assembly costing.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Parent</TableHead>
                <TableHead>Parent description</TableHead>
                <TableHead>Component</TableHead>
                <TableHead>Component description</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.length ? (
                lines.map((line) => (
                  <TableRow key={line.id}>
                    <TableCell className="font-mono">
                      {line.parentUid}
                    </TableCell>
                    <TableCell>{line.parentDescription}</TableCell>
                    <TableCell className="font-mono">
                      {line.componentUid}
                    </TableCell>
                    <TableCell>{line.componentDescription}</TableCell>
                    <TableCell className="text-right">
                      {line.quantity}
                    </TableCell>
                    <TableCell>{line.notes || "—"}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    className="h-28 text-center text-muted-foreground"
                    colSpan={6}
                  >
                    No BOM lines are available.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Add component</CardTitle>
          <CardDescription>
            Parent products must be Package or Assembly. Cycles and
            cross-organization links are rejected.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          {canWrite ? (
            <>
              <form className="grid gap-2" id="bom-parent-search">
                <input name="component" type="hidden" value={componentSearch} />
                <Label htmlFor="bom-parent-query">Find parent product</Label>
                <div className="flex gap-2">
                  <Input
                    defaultValue={parentSearch}
                    id="bom-parent-query"
                    name="parent"
                    placeholder="Product UID or description"
                  />
                  <Button type="submit" variant="outline">
                    Search
                  </Button>
                </div>
              </form>
              <BoundedResultNotice
                actionHref="#bom-parent-search"
                actionLabel="Refine parent search"
                coverage={parentOptions.coverage}
                searchQuery={parentSearch}
                section="Parent product options"
              />
              <form className="grid gap-2" id="bom-component-search">
                <input name="parent" type="hidden" value={parentSearch} />
                <Label htmlFor="bom-component-query">
                  Find component product
                </Label>
                <div className="flex gap-2">
                  <Input
                    defaultValue={componentSearch}
                    id="bom-component-query"
                    name="component"
                    placeholder="Product UID or description"
                  />
                  <Button type="submit" variant="outline">
                    Search
                  </Button>
                </div>
              </form>
              <BoundedResultNotice
                actionHref="#bom-component-search"
                actionLabel="Refine component search"
                coverage={componentOptions.coverage}
                searchQuery={componentSearch}
                section="Component product options"
              />
              <form action={addBomLineAction} className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="parent_item_id">Parent product</Label>
                  <select
                    className="h-9 rounded-md border bg-background px-3 text-sm"
                    id="parent_item_id"
                    name="parent_item_id"
                    required
                  >
                    <option value="">Select parent</option>
                    {parentOptions.rows.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.uid} — {product.description}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="component_item_id">Component product</Label>
                  <select
                    className="h-9 rounded-md border bg-background px-3 text-sm"
                    id="component_item_id"
                    name="component_item_id"
                    required
                  >
                    <option value="">Select component</option>
                    {componentOptions.rows.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.uid} — {product.description}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="quantity">Quantity</Label>
                  <Input
                    defaultValue="1"
                    id="quantity"
                    min="0.00000001"
                    name="quantity"
                    required
                    step="any"
                    type="number"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea id="notes" name="notes" />
                </div>
                <Button type="submit">Add BOM line</Button>
              </form>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Read-only access: BOM changes require Pricing Masters write
              capability.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
