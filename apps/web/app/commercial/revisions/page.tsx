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
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import { Textarea } from "@workspace/ui/components/textarea"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { commercialCapabilities } from "@/lib/auth/commercial-capabilities"
import { requireCapability } from "@/lib/auth/require-capability"

import {
  applyEngineeringChangeDecisionAction,
  completeBulkPriceRevisionAction,
  completeEngineeringChangeDesignAction,
  createBulkPriceRevisionAction,
  createEngineeringChangeNoteAction,
  stageBulkPriceRevisionAction,
} from "./actions"

export const dynamic = "force-dynamic"

const bulkFields = [
  ["profit_percent", "Profit percent"],
  ["scrap_rate", "Scrap percent"],
  ["alloy_premium", "Alloy premium · product route"],
  ["extrusion_cost", "Extrusion cost · product route"],
  ["forging_cost", "Forging cost · product route"],
  ["packing_cost", "Packing cost"],
  ["shipping_cost", "Shipping cost"],
  ["overhead_cost_input", "Overhead cost"],
  ["purchase_times", "Purchase multiplier"],
] as const

function localDate() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, "0")
  const day = String(now.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 4,
    minimumFractionDigits: 2,
  }).format(value)
}

export default async function CommercialRevisionsPage() {
  await requireCapability(
    commercialCapabilities.revisions.read,
    "/commercial/revisions"
  )
  const repository = createCommercialRevisionsRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const { affectedByEcn, bulkRevisions, ecns, reference } =
    await (async () => {
      const [bulkRevisions, ecns, reference] = await Promise.all([
        repository.listBulkPriceRevisions("MRMPL"),
        repository.listEngineeringChangeNotes("MRMPL"),
        repository.listRevisionReferenceData("MRMPL"),
      ])
      const affectedByEcn = new Map(
        await Promise.all(
          ecns
            .filter((ecn) => ecn.status === "Pending Costing")
            .map(
              async (ecn) =>
                [
                  ecn.id,
                  await repository.listEngineeringChangeAffectedPrices(ecn.id),
                ] as const
            )
        )
      )
      return { affectedByEcn, bulkRevisions, ecns, reference }
    })().finally(() => repository.close())

  return (
    <div className="grid gap-6">
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Start a bulk price revision</CardTitle>
            <CardDescription>
              Stage active sent prices, then complete once. Every affected
              package parent receives a new immutable quote revision.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {reference.organizationId ? (
              <form action={createBulkPriceRevisionAction}>
                <input
                  name="organization_id"
                  type="hidden"
                  value={reference.organizationId}
                />
                <FieldSet>
                  <FieldLegend>Revision request</FieldLegend>
                  <FieldGroup>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field>
                        <FieldLabel htmlFor="bulk-route">Route</FieldLabel>
                        <NativeSelect
                          id="bulk-route"
                          name="revision_route"
                          required
                        >
                          <NativeSelectOption value="Customer Parameter Bulk Revision">
                            Customer parameters
                          </NativeSelectOption>
                          <NativeSelectOption value="Product Parameter Bulk Revision">
                            Product parameters
                          </NativeSelectOption>
                        </NativeSelect>
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="bulk-effective">
                          Effective date
                        </FieldLabel>
                        <Input
                          defaultValue={localDate()}
                          id="bulk-effective"
                          name="effective_on"
                          required
                          type="date"
                        />
                      </Field>
                    </div>
                    <Field>
                      <FieldLabel htmlFor="bulk-customer">
                        Customer · required for customer route
                      </FieldLabel>
                      <NativeSelect id="bulk-customer" name="customer_id">
                        <NativeSelectOption value="">
                          No customer · product route
                        </NativeSelectOption>
                        {reference.customers.map((customer) => (
                          <NativeSelectOption
                            key={customer.id}
                            value={customer.id}
                          >
                            {customer.companyName}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="bulk-reason">Reason</FieldLabel>
                      <Textarea id="bulk-reason" name="reason" required />
                    </Field>
                    <Button className="w-fit" type="submit">
                      Create revision
                    </Button>
                  </FieldGroup>
                </FieldSet>
              </form>
            ) : (
              <p className="text-sm text-muted-foreground">
                The MRMPL organization must be loaded first.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Open an engineering change note</CardTitle>
            <CardDescription>
              Design completes first. Costing then records one keep-or-revise
              decision for every recursively affected customer price.
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
                  <FieldLegend>Engineering request</FieldLegend>
                  <FieldGroup>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field>
                        <FieldLabel htmlFor="ecn-item">Product</FieldLabel>
                        <NativeSelect id="ecn-item" name="item_id" required>
                          {reference.items.map((item) => (
                            <NativeSelectOption key={item.id} value={item.id}>
                              {item.uid} · {item.description}
                            </NativeSelectOption>
                          ))}
                        </NativeSelect>
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="ecn-effective">
                          Effective date
                        </FieldLabel>
                        <Input
                          defaultValue={localDate()}
                          id="ecn-effective"
                          name="effective_on"
                          type="date"
                        />
                      </Field>
                    </div>
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
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Bulk revision workbench</CardTitle>
          <CardDescription>
            Percent fields accept whole percentages, such as 30 for 30%.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {bulkRevisions.length ? (
            bulkRevisions.map((revision) => {
              const eligiblePrices = reference.activePrices.filter(
                (price) =>
                  !revision.companyName ||
                  price.companyName === revision.companyName
              )
              return (
                <div
                  className="grid gap-4 rounded-3xl border p-4"
                  key={revision.id}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="mb-2 flex flex-wrap gap-2">
                        <Badge
                          variant={
                            revision.status === "Completed"
                              ? "default"
                              : "secondary"
                          }
                        >
                          {revision.status}
                        </Badge>
                        <Badge variant="outline">
                          {revision.revisionRoute}
                        </Badge>
                      </div>
                      <p className="font-semibold">{revision.revisionNumber}</p>
                      <p className="text-sm text-muted-foreground">
                        {revision.companyName ?? "All customers"} · effective{" "}
                        {revision.effectiveOn}
                      </p>
                      <p className="mt-1 text-sm">{revision.reason}</p>
                    </div>
                    <p className="text-sm text-muted-foreground tabular-nums">
                      {revision.changeCount} staged ·{" "}
                      {revision.revisedQuoteCount} revised
                    </p>
                  </div>
                  {revision.status !== "Completed" ? (
                    <div className="grid gap-4 border-t pt-4 xl:grid-cols-[1fr_auto]">
                      <form action={stageBulkPriceRevisionAction}>
                        <input
                          name="bulk_price_revision_id"
                          type="hidden"
                          value={revision.id}
                        />
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                          <Field>
                            <FieldLabel htmlFor={`bulk-price-${revision.id}`}>
                              Active price
                            </FieldLabel>
                            <NativeSelect
                              disabled={!eligiblePrices.length}
                              id={`bulk-price-${revision.id}`}
                              name="selected_quote_item_id"
                              required
                            >
                              {eligiblePrices.map((price) => (
                                <NativeSelectOption
                                  key={price.id}
                                  value={price.id}
                                >
                                  {price.companyName} ·{" "}
                                  {price.customerPartCode ?? price.uid} · $
                                  {money(price.approvedPriceUsd)}
                                </NativeSelectOption>
                              ))}
                            </NativeSelect>
                          </Field>
                          <Field>
                            <FieldLabel htmlFor={`bulk-field-${revision.id}`}>
                              Parameter
                            </FieldLabel>
                            <NativeSelect
                              id={`bulk-field-${revision.id}`}
                              name="field_name"
                              required
                            >
                              {bulkFields.map(([value, label]) => (
                                <NativeSelectOption key={value} value={value}>
                                  {label}
                                </NativeSelectOption>
                              ))}
                            </NativeSelect>
                          </Field>
                          <Field>
                            <FieldLabel htmlFor={`bulk-value-${revision.id}`}>
                              New value
                            </FieldLabel>
                            <Input
                              id={`bulk-value-${revision.id}`}
                              name="new_value"
                              required
                              step="any"
                              type="number"
                            />
                          </Field>
                          <Field>
                            <FieldLabel htmlFor={`bulk-notes-${revision.id}`}>
                              Notes
                            </FieldLabel>
                            <Input
                              id={`bulk-notes-${revision.id}`}
                              name="notes"
                            />
                          </Field>
                        </div>
                        <Button
                          className="mt-3"
                          disabled={!eligiblePrices.length}
                          size="sm"
                          type="submit"
                          variant="outline"
                        >
                          Stage price
                        </Button>
                      </form>
                      <form
                        action={completeBulkPriceRevisionAction}
                        className="self-end"
                      >
                        <input
                          name="bulk_price_revision_id"
                          type="hidden"
                          value={revision.id}
                        />
                        <Button disabled={!revision.changeCount} type="submit">
                          Complete revision
                        </Button>
                      </form>
                    </div>
                  ) : null}
                </div>
              )
            })
          ) : (
            <p className="rounded-3xl border p-8 text-center text-sm text-muted-foreground">
              No bulk price revisions have been created.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Engineering change workbench</CardTitle>
          <CardDescription>
            Design and costing remain separate, matching the source workflow.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {ecns.length ? (
            ecns.map((ecn) => {
              const affected = affectedByEcn.get(ecn.id) ?? []
              return (
                <div className="grid gap-4 rounded-3xl border p-4" key={ecn.id}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="mb-2 flex flex-wrap gap-2">
                        <Badge
                          variant={
                            ecn.status === "Completed" ? "default" : "secondary"
                          }
                        >
                          {ecn.status}
                        </Badge>
                        <Badge variant="outline">{ecn.itemUid}</Badge>
                      </div>
                      <p className="font-semibold">{ecn.ecnNumber}</p>
                      <p className="text-sm text-muted-foreground">
                        {ecn.description}
                      </p>
                      <p className="mt-1 text-sm">{ecn.reason}</p>
                    </div>
                    <p className="text-sm text-muted-foreground tabular-nums">
                      {ecn.decisionCount} decisions
                    </p>
                  </div>
                  {ecn.status === "Pending Design" ? (
                    <form
                      action={completeEngineeringChangeDesignAction}
                      className="grid gap-3 border-t pt-4 sm:grid-cols-[1fr_auto]"
                    >
                      <input
                        name="engineering_change_note_id"
                        type="hidden"
                        value={ecn.id}
                      />
                      <Field>
                        <FieldLabel>Revised product description</FieldLabel>
                        <Input
                          defaultValue={ecn.description}
                          name="description"
                        />
                      </Field>
                      <Button className="self-end" type="submit">
                        Complete design
                      </Button>
                    </form>
                  ) : null}
                  {ecn.status === "Pending Costing" ? (
                    affected.length ? (
                      <form
                        action={applyEngineeringChangeDecisionAction}
                        className="grid gap-3 border-t pt-4 sm:grid-cols-2 xl:grid-cols-5"
                      >
                        <input
                          name="engineering_change_note_id"
                          type="hidden"
                          value={ecn.id}
                        />
                        <Field>
                          <FieldLabel>Affected customer price</FieldLabel>
                          <NativeSelect name="source_quote_item_id" required>
                            {affected.map((price) => (
                              <NativeSelectOption
                                key={price.quoteItemId}
                                value={price.quoteItemId}
                              >
                                {price.customerPartCode} · $
                                {money(price.approvedPriceUsd)}
                              </NativeSelectOption>
                            ))}
                          </NativeSelect>
                        </Field>
                        <Field>
                          <FieldLabel>Decision</FieldLabel>
                          <NativeSelect name="decision" required>
                            <NativeSelectOption value="Keep Price Same">
                              Keep price same
                            </NativeSelectOption>
                            <NativeSelectOption value="Revise Price">
                              Revise price
                            </NativeSelectOption>
                          </NativeSelect>
                        </Field>
                        <Field>
                          <FieldLabel>New profit % · revise only</FieldLabel>
                          <Input
                            name="new_profit_percent"
                            step="any"
                            type="number"
                          />
                        </Field>
                        <Field>
                          <FieldLabel>Notes</FieldLabel>
                          <Input name="notes" />
                        </Field>
                        <Button className="self-end" type="submit">
                          Record decision
                        </Button>
                      </form>
                    ) : (
                      <p className="border-t pt-4 text-sm text-muted-foreground">
                        No active customer price contains this product.
                      </p>
                    )
                  ) : null}
                </div>
              )
            })
          ) : (
            <p className="rounded-3xl border p-8 text-center text-sm text-muted-foreground">
              No engineering change notes have been created.
            </p>
          )}
        </CardContent>
      </Card>

    </div>
  )
}
