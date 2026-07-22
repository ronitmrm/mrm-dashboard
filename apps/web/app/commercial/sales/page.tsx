import Link from "next/link"

import { createCommercialWorkflowRepository } from "@workspace/db"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field"
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
import { requireCapability } from "@/lib/auth/require-capability"

import {
  completeFollowupAction,
  completeSalesClarificationAction,
  createFollowupAction,
  handOverEnquiryAction,
} from "../enquiries/actions"

export const dynamic = "force-dynamic"

export default async function SalesPage() {
  await requireCapability("pricing.sales.read", "/commercial/sales")
  const workflow = createCommercialWorkflowRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  try {
    const [
      clarificationTasks,
      enquiries,
      followups,
      handoverTasks,
      quoteReadyTasks,
      sentQuoteTasks,
    ] = await Promise.all([
      workflow.listSalesClarificationQueue("MRMPL"),
      workflow.listEnquiries("MRMPL"),
      workflow.listFollowups("MRMPL"),
      workflow.listSalesHandoverQueue("MRMPL"),
      workflow.listSalesQuoteReadyQueue("MRMPL"),
      workflow.listSalesSentQuoteQueue("MRMPL"),
    ])
    const candidateEntries = await Promise.all(
      clarificationTasks.map(
        async (task) =>
          [
            task.enquiryItemId,
            await workflow.listSalesMatchCandidates(task.enquiryItemId),
          ] as const
      )
    )
    const candidates = new Map(candidateEntries)
    const organizationId = enquiries[0]?.organizationId
    const today = new Date().toISOString().slice(0, 10)

    return (
      <div className="grid gap-6">
        <section className="grid gap-2">
          <h2 className="text-2xl font-semibold tracking-tight">Sales</h2>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Clarification matching, Technical handover, quote readiness, sent
            history, and due follow-ups share one source-equivalent queue.
          </p>
          <div className="flex flex-wrap gap-2 pt-2">
            <Button asChild size="sm" variant="outline">
              <Link href="/commercial/sales/history/export.xlsx">
                Export Sales history
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/commercial/sales/history/followups/export.xlsx">
                Export follow-ups
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/commercial/sales/history/sent-quotes/export.xlsx">
                Export sent quotes
              </Link>
            </Button>
          </div>
        </section>

        <Card>
          <CardHeader>
            <CardTitle>Sales clarification</CardTitle>
            <CardDescription>
              Choose new work, a commercial requote, or a technical revision.
              Quote candidates are scoped to the same customer.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5">
            {clarificationTasks.length ? (
              clarificationTasks.map((task) => (
                <form
                  action={completeSalesClarificationAction}
                  className="rounded-3xl border p-5"
                  key={task.clarificationTaskId}
                >
                  <input
                    type="hidden"
                    name="clarification_task_id"
                    value={task.clarificationTaskId}
                  />
                  <input
                    type="hidden"
                    name="enquiry_id"
                    value={task.enquiryId}
                  />
                  <input
                    type="hidden"
                    name="enquiry_item_id"
                    value={task.enquiryItemId}
                  />
                  <input
                    type="hidden"
                    name="organization_id"
                    value={task.organizationId}
                  />
                  <FieldGroup>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold">
                          {task.enquiryNumber} / Line {task.lineNumber}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {task.customerUid} · {task.companyName}
                        </p>
                      </div>
                      <Badge variant="outline">{task.question}</Badge>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                      <Field>
                        <FieldLabel
                          htmlFor={`${task.enquiryItemId}-sales-part`}
                        >
                          Part
                        </FieldLabel>
                        <Input
                          id={`${task.enquiryItemId}-sales-part`}
                          name="part"
                          defaultValue={task.customerPartCode}
                          required
                        />
                      </Field>
                      <Field>
                        <FieldLabel
                          htmlFor={`${task.enquiryItemId}-sales-description`}
                        >
                          Description
                        </FieldLabel>
                        <Input
                          id={`${task.enquiryItemId}-sales-description`}
                          name="description"
                          defaultValue={task.description}
                          required
                        />
                      </Field>
                      <Field>
                        <FieldLabel
                          htmlFor={`${task.enquiryItemId}-sales-grade`}
                        >
                          Grade
                        </FieldLabel>
                        <Input
                          id={`${task.enquiryItemId}-sales-grade`}
                          name="grade"
                          defaultValue={task.grade ?? ""}
                        />
                      </Field>
                      <Field>
                        <FieldLabel
                          htmlFor={`${task.enquiryItemId}-sales-quantity`}
                        >
                          Quantity
                        </FieldLabel>
                        <Input
                          id={`${task.enquiryItemId}-sales-quantity`}
                          name="quantity"
                          type="number"
                          min="0"
                          step="0.00000001"
                          defaultValue={task.quantity}
                        />
                      </Field>
                      <Field>
                        <FieldLabel
                          htmlFor={`${task.enquiryItemId}-sales-target`}
                        >
                          Target price
                        </FieldLabel>
                        <Input
                          id={`${task.enquiryItemId}-sales-target`}
                          name="target_price"
                          type="number"
                          min="0"
                          step="0.000001"
                          defaultValue={task.targetPrice ?? 0}
                        />
                      </Field>
                      <Field>
                        <FieldLabel
                          htmlFor={`${task.enquiryItemId}-sales-drawing-ref`}
                        >
                          Drawing reference
                        </FieldLabel>
                        <Input
                          id={`${task.enquiryItemId}-sales-drawing-ref`}
                          name="drawing_reference"
                          defaultValue={task.drawingReference ?? ""}
                        />
                      </Field>
                      <Field>
                        <FieldLabel
                          htmlFor={`${task.enquiryItemId}-sales-drawing`}
                        >
                          Replacement drawing
                        </FieldLabel>
                        <Input
                          id={`${task.enquiryItemId}-sales-drawing`}
                          name="drawing_file"
                          type="file"
                          accept=".pdf,.dwg,.dxf,.png,.jpg,.jpeg"
                        />
                      </Field>
                      <Field>
                        <FieldLabel
                          htmlFor={`${task.enquiryItemId}-sales-decision`}
                        >
                          Match decision
                        </FieldLabel>
                        <NativeSelect
                          id={`${task.enquiryItemId}-sales-decision`}
                          name="sales_match_decision"
                          defaultValue="new"
                        >
                          <NativeSelectOption value="new">
                            New item — return to Technical
                          </NativeSelectOption>
                          {(candidates.get(task.enquiryItemId) ?? []).flatMap(
                            (candidate) => [
                              <NativeSelectOption
                                key={`quote:${candidate.quoteItemId}`}
                                value={`quote:${candidate.quoteItemId}`}
                              >
                                Commercial · {candidate.productUid} ·{" "}
                                {candidate.quoteNumber}
                              </NativeSelectOption>,
                              <NativeSelectOption
                                key={`technical:${candidate.quoteItemId}`}
                                value={`technical:${candidate.quoteItemId}`}
                              >
                                Technical revision · {candidate.productUid} ·{" "}
                                {candidate.quoteNumber}
                              </NativeSelectOption>,
                            ]
                          )}
                        </NativeSelect>
                      </Field>
                    </div>
                    <Field>
                      <FieldLabel
                        htmlFor={`${task.enquiryItemId}-sales-remarks`}
                      >
                        Line remarks
                      </FieldLabel>
                      <Textarea
                        id={`${task.enquiryItemId}-sales-remarks`}
                        name="remarks"
                      />
                    </Field>
                    <Field>
                      <FieldLabel
                        htmlFor={`${task.enquiryItemId}-sales-response`}
                      >
                        Sales response
                      </FieldLabel>
                      <Textarea
                        id={`${task.enquiryItemId}-sales-response`}
                        name="response"
                        required
                      />
                    </Field>
                    <Button className="w-fit" type="submit">
                      Complete clarification
                    </Button>
                  </FieldGroup>
                </form>
              ))
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No Sales clarifications are open.
              </p>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Technical handover</CardTitle>
              <CardDescription>
                Draft enquiries with at least one line.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {handoverTasks.map((task) => {
                const missing = [
                  !task.incoterms ? "Incoterms" : null,
                  !task.paymentTerms ? "Payment terms" : null,
                  !task.shipmentMode ? "Shipment mode" : null,
                  !task.packagingTerms ? "Packaging" : null,
                  !task.currency ? "Currency" : null,
                  task.conversionRate <= 0 ? "FX rate" : null,
                ].filter(Boolean)
                return (
                  <div
                    className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4"
                    key={task.enquiryId}
                  >
                    <div>
                      <p className="font-medium">{task.enquiryNumber}</p>
                      <p className="text-sm text-muted-foreground">
                        {task.companyName} · {task.totalLines} lines
                        {missing.length
                          ? ` · Missing ${missing.join(", ")}`
                          : ""}
                      </p>
                    </div>
                    <form action={handOverEnquiryAction}>
                      <input
                        type="hidden"
                        name="enquiry_id"
                        value={task.enquiryId}
                      />
                      <Button
                        type="submit"
                        size="sm"
                        disabled={missing.length > 0 || task.salesHoldLines > 0}
                      >
                        Hand over
                      </Button>
                    </form>
                  </div>
                )
              })}
              {!handoverTasks.length ? (
                <p className="text-sm text-muted-foreground">
                  No enquiries are waiting for handover.
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Quote-ready</CardTitle>
              <CardDescription>
                Every feasible line is costed; not-feasible lines are omitted.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {quoteReadyTasks.map((task) => (
                <div
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4"
                  key={task.enquiryId}
                >
                  <div>
                    <p className="font-medium">{task.enquiryNumber}</p>
                    <p className="text-sm text-muted-foreground">
                      {task.quotedLines} quoted · {task.notQuotedLines} not
                      feasible · {task.currency}
                    </p>
                  </div>
                  <Button asChild size="sm" variant="outline">
                    <Link href="/commercial/quotes">Open quote register</Link>
                  </Button>
                </div>
              ))}
              {!quoteReadyTasks.length ? (
                <p className="text-sm text-muted-foreground">
                  No complete draft quotes are waiting.
                </p>
              ) : null}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Manual follow-up</CardTitle>
            <CardDescription>
              Create a Sales follow-up independently of quote send.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {organizationId ? (
              <form action={createFollowupAction}>
                <input
                  type="hidden"
                  name="organization_id"
                  value={organizationId}
                />
                <input type="hidden" name="status" value="Pending" />
                <FieldGroup>
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <Field>
                      <FieldLabel htmlFor="followup-enquiry">ENQ</FieldLabel>
                      <NativeSelect
                        id="followup-enquiry"
                        name="enquiry_id"
                        required
                      >
                        {enquiries.map((enquiry) => (
                          <NativeSelectOption
                            key={enquiry.id}
                            value={enquiry.id}
                          >
                            {enquiry.enquiryNumber} · {enquiry.companyName}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="followup-due">Due on</FieldLabel>
                      <Input
                        id="followup-due"
                        name="due_on"
                        type="date"
                        min={today}
                        defaultValue={today}
                        required
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="followup-channel">
                        Channel
                      </FieldLabel>
                      <NativeSelect
                        id="followup-channel"
                        name="channel"
                        defaultValue="Email"
                      >
                        {["Email", "Phone", "WhatsApp"].map((channel) => (
                          <NativeSelectOption key={channel} value={channel}>
                            {channel}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="followup-note">Notes</FieldLabel>
                      <Input id="followup-note" name="note" />
                    </Field>
                  </div>
                  <Button className="w-fit" type="submit">
                    Create follow-up
                  </Button>
                </FieldGroup>
              </form>
            ) : (
              <p className="text-sm text-muted-foreground">
                No enquiries are available.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Follow-up history</CardTitle>
            <CardDescription>
              Pending work is due when its local calendar date is today or
              earlier. Completion may chain the next reminder.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-3xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Due</TableHead>
                    <TableHead>ENQ</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Channel</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Notes / completion</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {followups.map((followup) => (
                    <TableRow key={followup.id}>
                      <TableCell>{followup.dueOn}</TableCell>
                      <TableCell>{followup.enquiryNumber}</TableCell>
                      <TableCell>{followup.companyName}</TableCell>
                      <TableCell>{followup.channel}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{followup.status}</Badge>
                      </TableCell>
                      <TableCell className="min-w-96">
                        {followup.status === "Pending" ? (
                          <form action={completeFollowupAction}>
                            <input
                              type="hidden"
                              name="followup_id"
                              value={followup.id}
                            />
                            <input
                              type="hidden"
                              name="status"
                              value="Completed"
                            />
                            <div className="grid gap-2 sm:grid-cols-2">
                              <Input
                                name="note"
                                defaultValue={followup.note}
                                aria-label="Completion notes"
                              />
                              <NativeSelect
                                name="channel"
                                defaultValue={followup.channel}
                                aria-label="Next channel"
                              >
                                {["Email", "Phone", "WhatsApp"].map(
                                  (channel) => (
                                    <NativeSelectOption
                                      key={channel}
                                      value={channel}
                                    >
                                      {channel}
                                    </NativeSelectOption>
                                  )
                                )}
                              </NativeSelect>
                              <Input
                                name="next_due_on"
                                type="date"
                                aria-label="Next due date"
                              />
                              <Input
                                name="next_note"
                                placeholder="Next reminder"
                                aria-label="Next notes"
                              />
                            </div>
                            <Button className="mt-2" size="sm" type="submit">
                              Complete
                            </Button>
                          </form>
                        ) : (
                          followup.note || "—"
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sent quotes</CardTitle>
            <CardDescription>
              Latest 50 enquiries with sent quote rows and follow-up coverage.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {sentQuoteTasks.map((task) => (
              <div
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4"
                key={task.enquiryId}
              >
                <div>
                  <p className="font-medium">{task.enquiryNumber}</p>
                  <p className="text-sm text-muted-foreground">
                    {task.companyName} · {task.sentQuoteItems} sent · Next{" "}
                    {task.nextFollowupDue ?? "not scheduled"}
                  </p>
                </div>
                <Badge variant="secondary">
                  {task.pendingFollowups} pending
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    )
  } finally {
    await workflow.close()
  }
}
