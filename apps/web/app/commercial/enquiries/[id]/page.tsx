import Link from "next/link"

import {
  createCommercialWorkflowRepository,
  createCustomerRepository,
  createProductRepository,
} from "@workspace/db"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  Field,
  FieldDescription,
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
import { Separator } from "@workspace/ui/components/separator"
import { Textarea } from "@workspace/ui/components/textarea"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"

import {
  addEnquiryItemAction,
  applyEnquiryImportReviewAction,
  deleteEnquiryAction,
  handOverEnquiryAction,
  importEnquiryLinesAction,
  prepareCostingAction,
  saveDesignAction,
  updateEnquiryAction,
  updateEnquiryItemAction,
  updateTechnicalReviewAction,
} from "../actions"

export const dynamic = "force-dynamic"

const checklist = [
  ["drawing_available", "Drawing available"],
  ["grade_material_clear", "Grade / material clear"],
  ["drawing_information_complete", "Drawing information complete"],
  ["finish_plating_clear", "Finish / plating clear"],
  ["packaging_clear", "Packaging clear"],
  ["tooling_process_feasible", "Tooling / process feasible"],
] as const

export default async function EnquiryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  await requireCapability(
    "pricing.enquiries.read",
    `/commercial/enquiries/${id}`
  )
  const connectionString = readAuthEnvironment().connectionString
  const workflow = createCommercialWorkflowRepository({ connectionString })
  const loaded = await (async () => {
    try {
      const snapshot = await workflow.getEnquiry(id)
      const drawingHistoryEntries = await Promise.all(
        snapshot.items.map(
          async (item) =>
            [
              item.id,
              await workflow.listDrawingHistory({
                enquiryItemId: item.id,
                organizationId: snapshot.enquiry.organizationId,
              }),
            ] as const
        )
      )
      return { drawingHistoryEntries, snapshot }
    } finally {
      await workflow.close()
    }
  })()
  const { snapshot } = loaded
  const drawingHistory = new Map(loaded.drawingHistoryEntries)
  const customerRepository = createCustomerRepository({ connectionString })
  const productRepository = createProductRepository({ connectionString })
  const [customers, products] = await Promise.all([
    customerRepository
      .listForOrganization("MRMPL")
      .finally(() => customerRepository.close()),
    productRepository
      .list(snapshot.enquiry.organizationId)
      .finally(() => productRepository.close()),
  ])

  return (
    <div className="grid gap-6">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="grid gap-2">
          <Button asChild className="w-fit" size="sm" variant="ghost">
            <Link href="/commercial/enquiries">Back to enquiries</Link>
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-semibold tracking-tight">
              {snapshot.enquiry.enquiryNumber}
            </h2>
            <Badge variant="secondary">{snapshot.enquiry.status}</Badge>
            <Badge variant="outline">
              {snapshot.enquiry.technicalHandoverStatus}
            </Badge>
          </div>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Each mutation below repeats its Better Auth capability check and
            commits the workflow transition atomically in PostgreSQL.
          </p>
          <div className="flex flex-wrap gap-2 pt-2">
            <Button asChild size="sm" variant="outline">
              <Link href={`/commercial/enquiries/${id}/lines/export.xlsx`}>
                Export logged lines
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/commercial/enquiries/template.csv">
                Line import template
              </Link>
            </Button>
          </div>
        </div>
        {snapshot.enquiry.technicalHandoverStatus !== "Handed Over" ? (
          <form action={handOverEnquiryAction}>
            <input type="hidden" name="enquiry_id" value={id} />
            <Button type="submit">Hand over to Technical Review</Button>
          </form>
        ) : null}
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Enquiry register details</CardTitle>
          <CardDescription>
            Corrections remain available only while the source downstream-work
            gate permits them.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={updateEnquiryAction}>
            <input type="hidden" name="enquiry_id" value={id} />
            <input
              type="hidden"
              name="organization_id"
              value={snapshot.enquiry.organizationId}
            />
            <FieldGroup>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Field>
                  <FieldLabel htmlFor="edit-enquiry-customer">
                    Customer
                  </FieldLabel>
                  <NativeSelect
                    id="edit-enquiry-customer"
                    name="customer_id"
                    defaultValue={snapshot.enquiry.customerId}
                  >
                    {customers.map((customer) => (
                      <NativeSelectOption key={customer.id} value={customer.id}>
                        {customer.customerUid} · {customer.companyName}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
                <Field>
                  <FieldLabel htmlFor="edit-enquiry-received">
                    Received on
                  </FieldLabel>
                  <Input
                    id="edit-enquiry-received"
                    name="received_on"
                    type="date"
                    defaultValue={snapshot.enquiry.receivedOn}
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="edit-enquiry-source">Source</FieldLabel>
                  <Input
                    id="edit-enquiry-source"
                    name="source"
                    defaultValue={snapshot.enquiry.source}
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="edit-enquiry-priority">
                    Priority
                  </FieldLabel>
                  <NativeSelect
                    id="edit-enquiry-priority"
                    name="priority"
                    defaultValue={snapshot.enquiry.priority}
                  >
                    {["Normal", "High", "Urgent"].map((priority) => (
                      <NativeSelectOption key={priority} value={priority}>
                        {priority}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
                <Field>
                  <FieldLabel htmlFor="edit-enquiry-buyer">
                    Buyer name
                  </FieldLabel>
                  <Input
                    id="edit-enquiry-buyer"
                    name="buyer_name"
                    defaultValue={snapshot.enquiry.buyerName ?? ""}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="edit-enquiry-incoterms">
                    Incoterms
                  </FieldLabel>
                  <Input
                    id="edit-enquiry-incoterms"
                    name="incoterms"
                    defaultValue={snapshot.enquiry.incoterms ?? ""}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="edit-enquiry-payment">
                    Payment terms
                  </FieldLabel>
                  <Input
                    id="edit-enquiry-payment"
                    name="payment_terms"
                    defaultValue={snapshot.enquiry.paymentTerms ?? ""}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="edit-enquiry-shipment">
                    Shipment mode
                  </FieldLabel>
                  <Input
                    id="edit-enquiry-shipment"
                    name="shipment_mode"
                    defaultValue={snapshot.enquiry.shipmentMode ?? ""}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="edit-enquiry-packaging">
                    Packaging
                  </FieldLabel>
                  <Input
                    id="edit-enquiry-packaging"
                    name="packaging_terms"
                    defaultValue={snapshot.enquiry.packagingTerms ?? ""}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="edit-enquiry-currency">
                    Currency
                  </FieldLabel>
                  <Input
                    id="edit-enquiry-currency"
                    name="currency"
                    defaultValue={snapshot.enquiry.currency}
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="edit-enquiry-fx">
                    FX / exchange rate
                  </FieldLabel>
                  <Input
                    id="edit-enquiry-fx"
                    name="conversion_rate"
                    type="number"
                    min="0.00000001"
                    step="0.00000001"
                    defaultValue={snapshot.enquiry.conversionRate}
                    required
                  />
                </Field>
              </div>
              <Field>
                <FieldLabel htmlFor="edit-enquiry-remarks">Remarks</FieldLabel>
                <Textarea
                  id="edit-enquiry-remarks"
                  name="remarks"
                  defaultValue={snapshot.enquiry.remarks ?? ""}
                />
              </Field>
              <div className="flex flex-wrap gap-3">
                <Button type="submit">Update enquiry</Button>
                {snapshot.enquiry.technicalHandoverStatus !== "Handed Over" ? (
                  <Button
                    formAction={deleteEnquiryAction}
                    type="submit"
                    variant="destructive"
                  >
                    Delete enquiry
                  </Button>
                ) : null}
              </div>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Add line item</CardTitle>
            <CardDescription>
              Drawings are stored locally; PostgreSQL keeps the checksum,
              metadata, and relational link.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={addEnquiryItemAction}>
              <input type="hidden" name="enquiry_id" value={id} />
              <input
                type="hidden"
                name="organization_id"
                value={snapshot.enquiry.organizationId}
              />
              <FieldGroup>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="line-part">Part</FieldLabel>
                    <Input id="line-part" name="part" required />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="line-description">
                      Description
                    </FieldLabel>
                    <Input id="line-description" name="description" required />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="line-quantity">Quantity</FieldLabel>
                    <Input
                      id="line-quantity"
                      name="quantity"
                      type="number"
                      min="0"
                      step="0.00000001"
                      defaultValue="0"
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="line-target-price">
                      Target price
                    </FieldLabel>
                    <Input
                      id="line-target-price"
                      name="target_price"
                      type="number"
                      min="0"
                      step="0.000001"
                      defaultValue="0"
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="line-grade">Grade</FieldLabel>
                    <Input id="line-grade" name="grade" />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="line-drawing-reference">
                      Drawing reference
                    </FieldLabel>
                    <Input
                      id="line-drawing-reference"
                      name="drawing_reference"
                    />
                  </Field>
                </div>
                <Field>
                  <FieldLabel htmlFor="line-drawing">Drawing file</FieldLabel>
                  <Input
                    id="line-drawing"
                    name="drawing_file"
                    type="file"
                    accept=".pdf,.dwg,.dxf,.png,.jpg,.jpeg"
                  />
                  <FieldDescription>Maximum file size: 25 MB.</FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="line-remarks">Remarks</FieldLabel>
                  <Textarea id="line-remarks" name="remarks" />
                </Field>
                <Button type="submit">Add line</Button>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Import line items</CardTitle>
            <CardDescription>
              Upload CSV, XLS, or XLSX. Every nonblank row is classified before
              an explicit review decision.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={importEnquiryLinesAction}>
              <input type="hidden" name="enquiry_id" value={id} />
              <input
                type="hidden"
                name="organization_id"
                value={snapshot.enquiry.organizationId}
              />
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="import-file">Import file</FieldLabel>
                  <Input
                    id="import-file"
                    name="template_file"
                    type="file"
                    accept=".csv,.xls,.xlsx"
                    required
                  />
                  <FieldDescription>
                    The content hash is the idempotency key; uploading the same
                    file reopens the same review.
                  </FieldDescription>
                </Field>
                <div className="flex flex-wrap gap-3">
                  <Button type="submit">Classify import rows</Button>
                  <Button asChild type="button" variant="outline">
                    <Link href="/commercial/enquiries/template.csv">
                      Download CSV template
                    </Link>
                  </Button>
                </div>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>
      </div>

      {snapshot.importReviews.some((review) => review.status === "Pending") ? (
        <section className="grid gap-4">
          <div>
            <h3 className="text-lg font-semibold">Pending import reviews</h3>
            <p className="text-sm text-muted-foreground">
              The source match order is preserved. Review each row before any
              enquiry line is created.
            </p>
          </div>
          {snapshot.importReviews
            .filter((review) => review.status === "Pending")
            .map((review) => (
              <Card key={review.id}>
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <CardTitle>Import review</CardTitle>
                      <CardDescription>{review.id}</CardDescription>
                    </div>
                    <Badge variant="secondary">{review.status}</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <form action={applyEnquiryImportReviewAction}>
                    <input type="hidden" name="enquiry_id" value={id} />
                    <input type="hidden" name="review_id" value={review.id} />
                    <input
                      type="hidden"
                      name="row_numbers"
                      value={JSON.stringify(
                        review.rows.map((row) => row.rowNumber)
                      )}
                    />
                    <FieldGroup>
                      {review.rows.map((row) => {
                        const rawPart = String(row.rawValues.part ?? "")
                        const rawDescription = String(
                          row.rawValues.description ?? ""
                        )
                        const hasMatch = Boolean(
                          row.matchedQuoteItemId ||
                          row.matchedProductId ||
                          row.matchedEnquiryItemId
                        )
                        const defaultAction =
                          row.suggestedAction === "Review Manually"
                            ? ""
                            : (row.suggestedAction ?? "")
                        return (
                          <FieldSet
                            key={row.rowNumber}
                            className="rounded-lg border p-4"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="grid gap-1">
                                <FieldLegend>Row {row.rowNumber}</FieldLegend>
                                <FieldDescription>
                                  {rawPart || "Missing part"} ·{" "}
                                  {rawDescription || "Missing description"}
                                </FieldDescription>
                              </div>
                              <Badge variant="outline">{row.status}</Badge>
                            </div>
                            {row.matchNote ? (
                              <p className="text-sm text-muted-foreground">
                                {row.matchNote}
                              </p>
                            ) : null}
                            <Field>
                              <FieldLabel
                                htmlFor={`import-${review.id}-${row.rowNumber}`}
                              >
                                Review decision
                              </FieldLabel>
                              <NativeSelect
                                id={`import-${review.id}-${row.rowNumber}`}
                                name={`action_${row.rowNumber}`}
                                defaultValue={defaultAction}
                                required
                              >
                                <NativeSelectOption value="" disabled>
                                  Choose an action
                                </NativeSelectOption>
                                <NativeSelectOption value="Add New Line">
                                  Add New Line
                                </NativeSelectOption>
                                {row.matchedProductId ? (
                                  <NativeSelectOption value="Commercial Requote">
                                    Commercial Requote
                                  </NativeSelectOption>
                                ) : null}
                                {row.matchedEnquiryItemId ? (
                                  <NativeSelectOption value="Link to existing work">
                                    Link to existing work
                                  </NativeSelectOption>
                                ) : null}
                                {hasMatch ? (
                                  <NativeSelectOption value="Technical Revision">
                                    Technical Revision
                                  </NativeSelectOption>
                                ) : null}
                                <NativeSelectOption value="Ask Sales">
                                  Ask Sales
                                </NativeSelectOption>
                                <NativeSelectOption value="Skip">
                                  Skip
                                </NativeSelectOption>
                              </NativeSelect>
                            </Field>
                          </FieldSet>
                        )
                      })}
                      <Button type="submit">Apply reviewed decisions</Button>
                    </FieldGroup>
                  </form>
                </CardContent>
              </Card>
            ))}
        </section>
      ) : null}

      <section className="grid gap-4">
        <div>
          <h3 className="text-lg font-semibold">Line workflow</h3>
          <p className="text-sm text-muted-foreground">
            Technical review and design retain the recovered Pricing status
            values and handoff gates.
          </p>
        </div>
        {snapshot.items.length ? (
          snapshot.items.map((item) => {
            const clarification = snapshot.clarifications.find(
              (task) => task.enquiryItemId === item.id && task.status === "Open"
            )
            const canStartCosting =
              (item.designStatus === "Design Complete" ||
                item.designStatus === "Not Required") &&
              (item.nextStageStatus === "Not Started" ||
                item.nextStageStatus === "Changes Required")
            return (
              <Card key={item.id}>
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <CardTitle>
                        Line {item.lineNumber} ·{" "}
                        {item.customerPartCode || "Unspecified part"}
                      </CardTitle>
                      <CardDescription>{item.description}</CardDescription>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">
                        {item.technicalReviewStatus}
                      </Badge>
                      {item.designStatus ? (
                        <Badge variant="secondary">{item.designStatus}</Badge>
                      ) : null}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-6">
                  <form
                    action={updateEnquiryItemAction}
                    className="rounded-2xl border p-4"
                  >
                    <input type="hidden" name="enquiry_id" value={id} />
                    <input
                      type="hidden"
                      name="enquiry_item_id"
                      value={item.id}
                    />
                    <input
                      type="hidden"
                      name="organization_id"
                      value={snapshot.enquiry.organizationId}
                    />
                    <FieldGroup>
                      <FieldSet>
                        <FieldLegend>Sales line correction</FieldLegend>
                        <FieldDescription>
                          Corrections after handover reset Technical and pending
                          Design state. Downstream quotes and orders lock edits.
                        </FieldDescription>
                      </FieldSet>
                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        <Field>
                          <FieldLabel htmlFor={`${item.id}-edit-part`}>
                            Part
                          </FieldLabel>
                          <Input
                            id={`${item.id}-edit-part`}
                            name="part"
                            defaultValue={item.customerPartCode ?? ""}
                            required
                          />
                        </Field>
                        <Field>
                          <FieldLabel htmlFor={`${item.id}-edit-description`}>
                            Description
                          </FieldLabel>
                          <Input
                            id={`${item.id}-edit-description`}
                            name="description"
                            defaultValue={item.description}
                            required
                          />
                        </Field>
                        <Field>
                          <FieldLabel htmlFor={`${item.id}-edit-grade`}>
                            Grade
                          </FieldLabel>
                          <Input
                            id={`${item.id}-edit-grade`}
                            name="grade"
                            defaultValue={item.grade ?? ""}
                          />
                        </Field>
                        <Field>
                          <FieldLabel htmlFor={`${item.id}-edit-quantity`}>
                            Quantity
                          </FieldLabel>
                          <Input
                            id={`${item.id}-edit-quantity`}
                            name="quantity"
                            type="number"
                            min="0"
                            step="0.00000001"
                            defaultValue={item.quantity}
                          />
                        </Field>
                        <Field>
                          <FieldLabel htmlFor={`${item.id}-edit-target`}>
                            Target price
                          </FieldLabel>
                          <Input
                            id={`${item.id}-edit-target`}
                            name="target_price"
                            type="number"
                            min="0"
                            step="0.000001"
                            defaultValue={item.targetPrice ?? 0}
                          />
                        </Field>
                        <Field>
                          <FieldLabel htmlFor={`${item.id}-edit-drawing-ref`}>
                            Drawing reference
                          </FieldLabel>
                          <Input
                            id={`${item.id}-edit-drawing-ref`}
                            name="drawing_reference"
                            defaultValue={item.drawingReference ?? ""}
                          />
                        </Field>
                        <Field>
                          <FieldLabel htmlFor={`${item.id}-edit-drawing-file`}>
                            Replacement drawing
                          </FieldLabel>
                          <Input
                            id={`${item.id}-edit-drawing-file`}
                            name="drawing_file"
                            type="file"
                            accept=".pdf,.dwg,.dxf,.png,.jpg,.jpeg"
                          />
                        </Field>
                        <Field>
                          <FieldLabel htmlFor={`${item.id}-edit-remarks`}>
                            Remarks
                          </FieldLabel>
                          <Input
                            id={`${item.id}-edit-remarks`}
                            name="remarks"
                            defaultValue={item.remarks ?? ""}
                          />
                        </Field>
                      </div>
                      <div className="flex flex-wrap gap-3">
                        <Button type="submit">Update line</Button>
                        {item.drawingFileId ? (
                          <Button asChild type="button" variant="outline">
                            <Link
                              href={`/commercial/enquiry-items/${item.id}/drawing`}
                            >
                              Open {item.drawingFileName ?? "drawing"}
                            </Link>
                          </Button>
                        ) : null}
                      </div>
                      {(drawingHistory.get(item.id)?.length ?? 0) > 0 ? (
                        <div className="grid gap-2 rounded-2xl bg-muted/40 p-3">
                          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                            Drawing history
                          </p>
                          {drawingHistory
                            .get(item.id)!
                            .map((drawing, index) => (
                              <div
                                className="flex flex-wrap items-center justify-between gap-2 text-sm"
                                key={drawing.id}
                              >
                                <span>
                                  {index === 0
                                    ? "Current"
                                    : `Revision ${index}`}{" "}
                                  · {drawing.fileName} · {drawing.byteSize}{" "}
                                  bytes
                                </span>
                                {index === 0 ? (
                                  <Link
                                    className="font-medium underline underline-offset-4"
                                    href={`/commercial/enquiry-items/${item.id}/drawing`}
                                  >
                                    Open
                                  </Link>
                                ) : null}
                              </div>
                            ))}
                        </div>
                      ) : null}
                    </FieldGroup>
                  </form>
                  <div className="grid gap-6 xl:grid-cols-2">
                    <form action={updateTechnicalReviewAction}>
                      <input type="hidden" name="enquiry_id" value={id} />
                      <input
                        type="hidden"
                        name="enquiry_item_id"
                        value={item.id}
                      />
                      <FieldGroup>
                        <FieldSet>
                          <FieldLegend>Technical review</FieldLegend>
                          <div className="grid gap-3 sm:grid-cols-2">
                            {checklist.map(([key, label]) => (
                              <Field
                                key={key}
                                orientation="horizontal"
                                className="items-center"
                              >
                                <Checkbox id={`${item.id}-${key}`} name={key} />
                                <FieldLabel htmlFor={`${item.id}-${key}`}>
                                  {label}
                                </FieldLabel>
                              </Field>
                            ))}
                          </div>
                        </FieldSet>
                        <Field>
                          <FieldLabel htmlFor={`${item.id}-review-status`}>
                            Review status
                          </FieldLabel>
                          <NativeSelect
                            id={`${item.id}-review-status`}
                            name="technical_review_status"
                            defaultValue={item.technicalReviewStatus}
                          >
                            <NativeSelectOption value="Pending Review">
                              Pending Review
                            </NativeSelectOption>
                            <NativeSelectOption value="Need Clarification">
                              Need Clarification
                            </NativeSelectOption>
                            <NativeSelectOption value="Feasible">
                              Feasible
                            </NativeSelectOption>
                            <NativeSelectOption value="Not Feasible">
                              Not Feasible
                            </NativeSelectOption>
                            <NativeSelectOption value="Duplicate / Existing Product">
                              Duplicate / Existing Product
                            </NativeSelectOption>
                          </NativeSelect>
                        </Field>
                        <Field>
                          <FieldLabel
                            htmlFor={`${item.id}-missing-information`}
                          >
                            Missing information
                          </FieldLabel>
                          <Textarea
                            id={`${item.id}-missing-information`}
                            name="missing_information"
                          />
                        </Field>
                        <Field>
                          <FieldLabel htmlFor={`${item.id}-technical-remarks`}>
                            Technical remarks
                          </FieldLabel>
                          <Textarea
                            id={`${item.id}-technical-remarks`}
                            name="technical_remarks"
                          />
                        </Field>
                        <Button type="submit">Save technical review</Button>
                      </FieldGroup>
                    </form>

                    <form action={saveDesignAction}>
                      <input type="hidden" name="enquiry_id" value={id} />
                      <input
                        type="hidden"
                        name="organization_id"
                        value={snapshot.enquiry.organizationId}
                      />
                      <input
                        type="hidden"
                        name="enquiry_item_id"
                        value={item.id}
                      />
                      <FieldGroup>
                        <FieldSet>
                          <FieldLegend>Design handoff</FieldLegend>
                          <FieldDescription>
                            Existing portfolio matches skip product design. New
                            list designs retain their first material line for
                            costing.
                          </FieldDescription>
                        </FieldSet>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <Field>
                            <FieldLabel htmlFor={`${item.id}-portfolio-status`}>
                              Portfolio decision
                            </FieldLabel>
                            <NativeSelect
                              id={`${item.id}-portfolio-status`}
                              name="portfolio_match_status"
                              defaultValue="New Design Required"
                            >
                              <NativeSelectOption value="New Design Required">
                                New Design Required
                              </NativeSelectOption>
                              <NativeSelectOption value="Matches Existing Portfolio">
                                Matches Existing Portfolio
                              </NativeSelectOption>
                            </NativeSelect>
                          </Field>
                          <Field>
                            <FieldLabel htmlFor={`${item.id}-design-status`}>
                              Design status
                            </FieldLabel>
                            <NativeSelect
                              id={`${item.id}-design-status`}
                              name="design_status"
                              defaultValue={
                                item.designStatus || "Pending Design"
                              }
                            >
                              <NativeSelectOption value="Pending Design">
                                Pending Design
                              </NativeSelectOption>
                              <NativeSelectOption value="Design Complete">
                                Design Complete
                              </NativeSelectOption>
                              <NativeSelectOption value="Need Clarification">
                                Need Clarification
                              </NativeSelectOption>
                            </NativeSelect>
                          </Field>
                          <Field>
                            <FieldLabel htmlFor={`${item.id}-matched-product`}>
                              Matched product
                            </FieldLabel>
                            <NativeSelect
                              id={`${item.id}-matched-product`}
                              name="matched_product_id"
                              defaultValue=""
                            >
                              <NativeSelectOption value="">
                                No portfolio match
                              </NativeSelectOption>
                              {products.map((product) => (
                                <NativeSelectOption
                                  key={product.id}
                                  value={product.id}
                                >
                                  {product.uid} · {product.description}
                                </NativeSelectOption>
                              ))}
                            </NativeSelect>
                          </Field>
                          <Field>
                            <FieldLabel htmlFor={`${item.id}-quoted-uid`}>
                              New Q part
                            </FieldLabel>
                            <Input
                              id={`${item.id}-quoted-uid`}
                              name="quoted_part_uid"
                            />
                          </Field>
                          <Field>
                            <FieldLabel htmlFor={`${item.id}-item-type`}>
                              Item type
                            </FieldLabel>
                            <NativeSelect
                              id={`${item.id}-item-type`}
                              name="item_type"
                              defaultValue="List"
                            >
                              <NativeSelectOption value="List">
                                List
                              </NativeSelectOption>
                              <NativeSelectOption value="Package">
                                Package
                              </NativeSelectOption>
                              <NativeSelectOption value="Assembly">
                                Assembly
                              </NativeSelectOption>
                            </NativeSelect>
                          </Field>
                          <Field>
                            <FieldLabel htmlFor={`${item.id}-process`}>
                              Manufacturing process
                            </FieldLabel>
                            <Input
                              id={`${item.id}-process`}
                              name="manufacturing_process"
                            />
                          </Field>
                          <Field>
                            <FieldLabel htmlFor={`${item.id}-rod-size`}>
                              Rod size
                            </FieldLabel>
                            <Input id={`${item.id}-rod-size`} name="rod_size" />
                          </Field>
                          <Field>
                            <FieldLabel htmlFor={`${item.id}-rod-type`}>
                              Rod type
                            </FieldLabel>
                            <Input id={`${item.id}-rod-type`} name="rod_type" />
                          </Field>
                          <Field>
                            <FieldLabel htmlFor={`${item.id}-piece-weight`}>
                              Piece weight
                            </FieldLabel>
                            <Input
                              id={`${item.id}-piece-weight`}
                              name="piece_weight"
                              type="number"
                              min="0"
                              step="0.00000001"
                              defaultValue="0"
                            />
                          </Field>
                          <Field>
                            <FieldLabel htmlFor={`${item.id}-casting`}>
                              Casting
                            </FieldLabel>
                            <Input
                              id={`${item.id}-casting`}
                              name="casting"
                              type="number"
                              min="0"
                              step="0.00000001"
                              defaultValue="1"
                            />
                          </Field>
                        </div>
                        <Button type="submit">Save design decision</Button>
                      </FieldGroup>
                    </form>
                  </div>

                  {clarification ? (
                    <>
                      <Separator />
                      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4">
                        <p className="text-sm text-muted-foreground">
                          {clarification.sourceStage} requested a Sales match
                          decision for this line.
                        </p>
                        <Button asChild>
                          <Link href="/commercial/sales">
                            Resolve in Sales queue
                          </Link>
                        </Button>
                      </div>
                    </>
                  ) : null}

                  {canStartCosting ? (
                    <>
                      <Separator />
                      <form action={prepareCostingAction}>
                        <input type="hidden" name="enquiry_id" value={id} />
                        <input
                          type="hidden"
                          name="enquiry_item_id"
                          value={item.id}
                        />
                        <Button type="submit">Prepare product costing</Button>
                      </form>
                    </>
                  ) : null}
                </CardContent>
              </Card>
            )
          })
        ) : (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              Add at least one line before handing the enquiry to Technical
              Review.
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  )
}
