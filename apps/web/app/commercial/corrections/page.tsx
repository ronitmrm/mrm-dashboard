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

  return (
    <div className="grid gap-6">
      <section className="grid gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-2xl font-semibold tracking-tight">Corrections</h2>
          <Badge variant="outline">Audited reversals</Badge>
        </div>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Safe source reversals are executable. Sent quotes and other historical
          commercial evidence remain immutable and use quarantine requests.
        </p>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Reverse Design → Costing handoff</CardTitle>
            <CardDescription>
              Only a completed design whose costing handoff has just started is
              eligible. The design dossier is retained.
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
                          {candidate.enquiryNumber} · Line {candidate.lineNumber}
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
                  <Button type="submit">Return handoff to Not Started</Button>
                </FieldGroup>
              </form>
            ) : (
              <p className="text-sm text-muted-foreground">
                No just-started Design → Costing handoff can be reversed.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Reverse unused quoted product</CardTitle>
            <CardDescription>
              This deletes only an unused Q/QUOTE product and its parent BOM.
              Quote, component, and design-match references block deletion.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {candidates.products.length ? (
              <form action={reverseProductEntryAction}>
                <FieldGroup>
                  <Field>
                    <FieldLabel>Quoted product</FieldLabel>
                    <NativeSelect name="item_id" required>
                      {candidates.products.map((product) => (
                        <NativeSelectOption key={product.id} value={product.id}>
                          {product.uid} · {product.description}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                    <FieldDescription>
                      Eligibility is rechecked under lock before deletion.
                    </FieldDescription>
                  </Field>
                  <Field>
                    <FieldLabel>Remarks</FieldLabel>
                    <Textarea name="remarks" />
                  </Field>
                  <Button type="submit" variant="destructive">
                    Delete unused quoted product
                  </Button>
                </FieldGroup>
              </form>
            ) : (
              <p className="text-sm text-muted-foreground">
                No unused quoted product can be reversed.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Historical correction quarantine</CardTitle>
          <CardDescription>
            Destructive sent-price requests stay visible without mutating the
            historical record.
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
                  <FieldLabel>Historical target</FieldLabel>
                  <NativeSelect name="target_id" required>
                    {reference.activePrices.map((price) => (
                      <NativeSelectOption key={price.id} value={price.id}>
                        {price.quoteNumber} · {price.companyName} · {price.uid}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
                <Field>
                  <FieldLabel>Requested action</FieldLabel>
                  <NativeSelect name="requested_action" required>
                    <NativeSelectOption value="Delete historical price">
                      Delete historical price
                    </NativeSelectOption>
                    <NativeSelectOption value="Rewrite historical price">
                      Rewrite historical price
                    </NativeSelectOption>
                  </NativeSelect>
                </Field>
                <Field className="sm:col-span-2 xl:col-span-1">
                  <FieldLabel>Reason</FieldLabel>
                  <Input name="reason" required />
                </Field>
                <Button className="self-end" type="submit" variant="outline">
                  Quarantine request
                </Button>
              </div>
            </form>
          ) : null}

          <div className="overflow-hidden rounded-3xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Target</TableHead>
                  <TableHead>Requested action</TableHead>
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
                      No pricing correction requests are quarantined.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
