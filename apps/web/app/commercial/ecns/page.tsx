import Link from "next/link"

import { createCommercialRevisionsRepository } from "@workspace/db"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  MetricCard,
} from "@workspace/ui/components/card"
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
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
import { commercialCapabilities } from "@/lib/auth/commercial-capabilities"
import { requireCapability } from "@/lib/auth/require-capability"
import { ecnStageHref } from "@/lib/pricing/ecn-routes"

import { createEngineeringChangeNoteAction } from "../revisions/actions"
import { EcnProductSelector } from "./ecn-product-selector"

export const dynamic = "force-dynamic"

const registerLimit = 100

function localDate() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, "0")
  const day = String(now.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function actionLabel(status: string) {
  if (status === "Pending Design") return "Open Design"
  if (status === "Pending Product Costing") return "Open Product Costing"
  if (status === "Pending Costing") return "Open Customer Costing"
  return "View ECN"
}

export default async function EngineeringChangeNotesPage() {
  await requireCapability(
    commercialCapabilities.revisions.read,
    "/commercial/ecns"
  )
  const repository = createCommercialRevisionsRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const data = await (async () => {
    try {
      const [ecns, metrics, reference] = await Promise.all([
        repository.listEngineeringChangeNotes("MRMPL", {
          limit: registerLimit,
        }),
        repository.getEngineeringChangeMetrics("MRMPL"),
        repository.listEngineeringChangeReferenceData("MRMPL"),
      ])
      return { ecns, metrics, reference }
    } finally {
      await repository.close()
    }
  })()
  const { ecns, metrics, reference } = data

  return (
    <div className="grid gap-6">
      <section className="grid gap-2">
        <h2 className="text-2xl font-semibold tracking-tight">
          Engineering Change Notes
        </h2>
        {ecns.length === registerLimit ? (
          <p className="text-xs text-muted-foreground">
            Showing The Latest {registerLimit} ECNs. Open Work Counts Remain
            Complete.
          </p>
        ) : null}
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Open ECNs" value={metrics.open} />
        <MetricCard label="With Design" value={metrics.pendingDesign} />
        <MetricCard
          label="With Product Costing"
          value={metrics.pendingProductCosting}
        />
        <MetricCard
          label="With Customer Costing"
          value={metrics.pendingCosting}
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Open An Engineering Change Note</CardTitle>
          <CardDescription>
            Only Ordered Internal Portfolio Products Can Enter This Workflow.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {reference.organizationId ? (
            <form action={createEngineeringChangeNoteAction}>
              <input
                name="organization_id"
                type="hidden"
                value={reference.organizationId}
              />
              <FieldSet>
                <FieldLegend>Engineering Request</FieldLegend>
                <FieldGroup>
                  <EcnProductSelector items={reference.items} />
                  <Field className="max-w-sm">
                    <FieldLabel htmlFor="ecn-effective">
                      Effective Date
                    </FieldLabel>
                    <Input
                      defaultValue={localDate()}
                      id="ecn-effective"
                      name="effective_on"
                      type="date"
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="ecn-reason">Reason</FieldLabel>
                    <Textarea id="ecn-reason" name="reason" required />
                  </Field>
                  <Button className="w-fit" type="submit">
                    Create ECN
                  </Button>
                </FieldGroup>
              </FieldSet>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">
              The MRMPL Organization Must Be Loaded First.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>ECN Register</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-h-[65vh] overflow-auto rounded-md border">
            <Table
              containerClassName="max-h-none overflow-visible"
              excelFilters
            >
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  <TableHead data-filterable="true">ECN</TableHead>
                  <TableHead data-filterable="true">Created</TableHead>
                  <TableHead data-filterable="true">Product UID</TableHead>
                  <TableHead data-filterable="true">Product</TableHead>
                  <TableHead data-filterable="true">Design Change</TableHead>
                  <TableHead data-filterable="true">Reason</TableHead>
                  <TableHead>Customer Costing</TableHead>
                  <TableHead data-filterable="true">Status</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ecns.map((ecn) => (
                  <TableRow
                    className="[contain-intrinsic-size:auto_48px] [content-visibility:auto]"
                    key={ecn.id}
                  >
                    <TableCell className="font-medium">
                      {ecn.ecnNumber}
                    </TableCell>
                    <TableCell>
                      {ecn.createdAt.toLocaleDateString("en-IN")}
                    </TableCell>
                    <TableCell>{ecn.itemUid}</TableCell>
                    <TableCell className="max-w-80 whitespace-normal">
                      {ecn.description}
                    </TableCell>
                    <TableCell>Design Task Update</TableCell>
                    <TableCell className="max-w-96 whitespace-normal">
                      {ecn.reason}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {ecn.decisionCount} / {ecn.affectedPriceCount}
                    </TableCell>
                    <TableCell data-filter-value={ecn.status}>
                      <Badge
                        variant={
                          ecn.status === "Completed" ? "default" : "secondary"
                        }
                      >
                        {ecn.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button asChild size="sm" variant="outline">
                        <Link href={ecnStageHref(ecn.id, ecn.status)}>
                          {actionLabel(ecn.status)}
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!ecns.length ? (
                  <TableRow>
                    <TableCell className="h-24 text-center" colSpan={9}>
                      No Engineering Change Notes Have Been Created.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
