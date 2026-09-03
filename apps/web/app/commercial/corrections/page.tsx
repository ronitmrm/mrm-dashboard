import { createCommercialRevisionsRepository } from "@workspace/db"
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
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import {
 OperationalTable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { Textarea } from "@workspace/ui/components/textarea"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { MetricSummary } from "@/components/ui/golden-patterns"
import { commercialCapabilities } from "@/lib/auth/commercial-capabilities"
import { requireCapability } from "@/lib/auth/require-capability"

import {
  recordPricingCorrectionAction,
  reverseDesignCostingHandoffAction,
  reverseProductEntryAction,
} from "./actions"

export const dynamic = "force-dynamic"

export default async function CommercialCorrectionsPage() {
  await requireCapability(
    commercialCapabilities.corrections.read,
    "/commercial/corrections"
  )
  const repository = createCommercialRevisionsRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const [candidates, corrections, reference] = await Promise.all([
    repository.listCorrectionCandidates("MRMPL"),
    repository.listPricingCorrections("MRMPL"),
    repository.listRevisionReferenceData("MRMPL"),
  ]).finally(() => repository.close())
  const hasReversibleProducts = candidates.products.some(
    (product) => product.canReverse
  )

  return (
    <div className="grid gap-6">
      <section className="grid gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-2xl font-semibold tracking-tight">Corrections</h2>
          <Badge variant="outline">Audited Reversals</Badge>
        </div>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Safe Source Reversals Are Executable. Sent Quotes And Other Historical
          Commercial Evidence Remain Immutable And Use Quarantine Requests.
        </p>
      </section>

      <MetricSummary
        scope="Loaded correction workspace · before table filters"
        items={[
          {
            label: "Reversible Handoffs",
            value: candidates.designHandoffs.length,
            tone: "information"
          },
          {
            label: "Reversible Products",
            value: candidates.products.filter((row) => row.canReverse).length,
            tone: "warning"
          },
          { tone: "brand", label: "Correction Records", value: corrections.length }
        ]}
      />

      <div className="grid gap-6 xl:grid-cols-2">
 <SectionCard>
          <CardHeader>
            <CardTitle>Reverse Design → Costing Handoff</CardTitle>
            <CardDescription>
              Only A Completed Design Whose Costing Handoff Has Just Started Is
              Eligible. The Design Dossier Is Retained.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {candidates.designHandoffs.length ? (
              <form action={reverseDesignCostingHandoffAction}>
                <FieldGroup>
                  <Field>
                    <FieldLabel>Handoff</FieldLabel>
                    <NativeSelect name="design_task_id" required>
                      {candidates.designHandoffs.map((candidate) => (
                        <NativeSelectOption
                          key={candidate.designTaskId}
                          value={candidate.designTaskId}
                        >
                          {candidate.enquiryNumber} · {candidate.companyName} ·
                          Line {candidate.lineNumber}
                          {candidate.partReference
                            ? ` · ${candidate.partReference}`
                            : ""}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </Field>
                  <Field>
                    <FieldLabel>Remarks</FieldLabel>
                    <Textarea name="remarks" />
                  </Field>
                  <Button type="submit">Return Handoff To Not Started</Button>
                </FieldGroup>
              </form>
            ) : (
              <p className="text-sm text-muted-foreground">
                No Just-Started Design → Costing Handoff Can Be Reversed.
              </p>
            )}
          </CardContent>
 </SectionCard>

 <SectionCard>
          <CardHeader>
            <CardTitle>Reverse Unused Quoted Product</CardTitle>
            <CardDescription>
              This Deletes Only An Unused Q/Quote Product And Its Parent Bom.
              Quote, Component, And Design-Match References Block Deletion.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {candidates.products.length ? (
              <form action={reverseProductEntryAction}>
                <FieldGroup>
                  <Field>
                    <FieldLabel>Quoted Product</FieldLabel>
                    <NativeSelect name="item_id" required>
                      {candidates.products.map((product) => (
                        <NativeSelectOption
                          disabled={!product.canReverse}
                          key={product.id}
                          value={product.id}
                        >
                          {product.uid} · {product.description}
                          {!product.canReverse
                            ? ` · blocked: ${[
                                product.blockerCounts.quotes
                                  ? `${product.blockerCounts.quotes} quote(s)`
                                  : null,
                                product.blockerCounts.componentBom
                                  ? "Used In Bom"
                                  : null,
                                product.blockerCounts.matchedDesign
                                  ? "Design Match"
                                  : null,
                              ]
                                .filter(Boolean)
                                .join(", ")}`
                            : ""}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                    <FieldDescription>
                      Eligibility Is Rechecked Under Lock Before Deletion.
                    </FieldDescription>
                  </Field>
                  <Field>
                    <FieldLabel>Remarks</FieldLabel>
                    <Textarea name="remarks" />
                  </Field>
                  <Button
                    disabled={!hasReversibleProducts}
                    type="submit"
                    variant="destructive"
                  >
                    Delete Unused Quoted Product
                  </Button>
                </FieldGroup>
              </form>
            ) : (
              <p className="text-sm text-muted-foreground">
                No Unused Quoted Product Can Be Reversed.
              </p>
            )}
          </CardContent>
 </SectionCard>
      </div>

 <SectionCard>
        <CardHeader>
          <CardTitle>Historical Correction Quarantine</CardTitle>
          <CardDescription>
            Destructive Sent-Price Requests Stay Visible Without Mutating The
            Historical Record.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          {reference.organizationId && reference.activePrices.length ? (
            <form action={recordPricingCorrectionAction}>
              <input
                name="organization_id"
                type="hidden"
                value={reference.organizationId}
              />
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Field>
                  <FieldLabel>Historical Target</FieldLabel>
                  <NativeSelect name="target_id" required>
                    {reference.activePrices.map((price) => (
                      <NativeSelectOption key={price.id} value={price.id}>
                        {price.quoteNumber} · {price.companyName} · {price.uid}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
                <Field>
                  <FieldLabel>Requested Action</FieldLabel>
                  <NativeSelect name="requested_action" required>
                    <NativeSelectOption value="Delete historical price">
                      Delete Historical Price
                    </NativeSelectOption>
                    <NativeSelectOption value="Rewrite historical price">
                      Rewrite Historical Price
                    </NativeSelectOption>
                  </NativeSelect>
                </Field>
                <Field className="sm:col-span-2 xl:col-span-1">
                  <FieldLabel>Reason</FieldLabel>
                  <Input name="reason" required />
                </Field>
                <Button className="self-end" type="submit" variant="outline">
                  Quarantine Request
                </Button>
              </div>
            </form>
          ) : null}

          <div className="overflow-hidden rounded-3xl border">
 <OperationalTable>
              <TableHeader>
                <TableRow>
                  <TableHead>Target</TableHead>
                  <TableHead>Requested Action</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {corrections.length ? (
                  corrections.map((correction) => (
                    <TableRow key={correction.id}>
                      <TableCell className="font-mono text-xs">
                        {correction.targetTable} · {correction.targetId}
                      </TableCell>
                      <TableCell>{correction.requestedAction}</TableCell>
                      <TableCell>{correction.reason}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{correction.status}</Badge>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      className="h-24 text-center text-muted-foreground"
                      colSpan={4}
                    >
                      No Pricing Correction Requests Are Quarantined.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
 </OperationalTable>
          </div>
        </CardContent>
 </SectionCard>
    </div>
  )
}
