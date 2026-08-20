import Link from "next/link"

import {
  commercialTermTypes,
  createCommercialMasterRepository,
  createCommercialWorkflowRepository,
  createCustomerRepository,
  createProductRepository,
  type CommercialTermType,
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
import { BoundedResultNotice } from "@/components/bounded-result-notice"

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

function EnquiryTermSelect({
  defaultValue,
  label,
  name,
  options,
}: {
  defaultValue: string | null
  label: string
  name: string
  options: string[]
}) {
  const id = `edit-enquiry-${name.replaceAll("_", "-")}`
  const visibleOptions =
    defaultValue && !options.includes(defaultValue)
      ? [defaultValue, ...options]
      : options
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <NativeSelect
        className="w-full"
        defaultValue={defaultValue ?? ""}
        id={id}
        name={name}
        required
      >
        <NativeSelectOption value="">Select {label}</NativeSelectOption>
        {visibleOptions.map((option) => (
          <NativeSelectOption key={option} value={option}>
            {option}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </Field>
  )
}

export default async function EnquiryDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ product?: string }>
}) {
  const { id } = await params
  const selectorParams = await searchParams
  const productSearch = selectorParams.product?.trim() ?? ""
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
  const masterRepository = createCommercialMasterRepository({
    connectionString,
  })
  const productRepository = createProductRepository({ connectionString })
  const { customerRows, masterSnapshot, productOptions } = await (async () => {
    try {
      const [customers, products, masters] = await Promise.all([
        customerRepository.listForOrganization("MRMPL"),
        productRepository.searchForOrganization("MRMPL", productSearch),
        masterRepository.snapshot(snapshot.enquiry.organizationId),
      ])
      return {
        customerRows: customers,
        masterSnapshot: masters,
        productOptions: products,
      }
    } finally {
      await customerRepository.close()
      await masterRepository.close()
      await productRepository.close()
    }
  })()
  const customers = customerRows.filter(
    (customer) =>
      customer.status === "Active" ||
      customer.id === snapshot.enquiry.customerId
  )
  const products = productOptions.rows
  const termOptions = Object.fromEntries(
    commercialTermTypes.map((termType) => [
      termType,
      masterSnapshot.commercialTerms
        .filter((term) => term.active && term.termType === termType)
        .map((term) => term.name),
    ])
  ) as Record<CommercialTermType, string[]>

  return (
    <div className="grid gap-6">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="grid gap-2">
          <Button asChild className="w-fit" size="sm" variant="ghost">
            <Link href="/commercial/enquiries">Back To Enquiries</Link>
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
            Each Mutation Below Repeats Its Better Auth Capability Check And
            Commits The Workflow Transition Atomically In Postgresql.
          </p>
          <div className="flex flex-wrap gap-2 pt-2">
            <Button asChild size="sm" variant="outline">
              <Link href={`/commercial/enquiries/${id}/lines/export.xlsx`}>
                Export Logged Lines
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/commercial/enquiries/template.csv">
                Line Import Template
              </Link>
            </Button>
          </div>
        </div>
        {snapshot.enquiry.technicalHandoverStatus !== "Handed Over" ? (
          <form action={handOverEnquiryAction}>
            <input type="hidden" name="enquiry_id" value={id} />
            <Button type="submit">Hand Over To Technical Review</Button>
          </form>
        ) : null}
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Enquiry Register Details</CardTitle>
          <CardDescription>
            Corrections Remain Available Only While The Source Downstream-Work
            Gate Permits Them.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
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
                    Received On
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
                <EnquiryTermSelect
                  defaultValue={snapshot.enquiry.buyerName}
                  label="Buyer"
                  name="buyer_name"
                  options={termOptions.buyer}
                />
                <EnquiryTermSelect
                  defaultValue={snapshot.enquiry.incoterms}
                  label="Incoterms"
                  name="incoterms"
                  options={termOptions.incoterms}
                />
                <EnquiryTermSelect
                  defaultValue={snapshot.enquiry.paymentTerms}
                  label="Payment Terms"
                  name="payment_terms"
                  options={termOptions.payment_terms}
                />
                <EnquiryTermSelect
                  defaultValue={snapshot.enquiry.shipmentMode}
                  label="Shipment Mode"
                  name="shipment_mode"
                  options={termOptions.shipment_mode}
                />
                <EnquiryTermSelect
                  defaultValue={snapshot.enquiry.packagingTerms}
                  label="Packaging"
                  name="packaging_terms"
                  options={termOptions.packaging_terms}
                />
                <EnquiryTermSelect
                  defaultValue={snapshot.enquiry.currency}
                  label="Currency"
                  name="currency"
                  options={termOptions.currency}
                />
                <Field>
                  <FieldLabel htmlFor="edit-enquiry-fx">
                    Fx / Exchange Rate
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
                <Button type="submit">Update Enquiry</Button>
                {snapshot.enquiry.technicalHandoverStatus !== "Handed Over" ? (
                  <Button
                    formAction={deleteEnquiryAction}
                    type="submit"
                    variant="destructive"
                  >
                    Delete Enquiry
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
            <CardTitle>Add Line Item</CardTitle>
            <CardDescription>
              Drawings Are Stored Locally; Postgresql Keeps The Checksum,
              Metadata, And Relational Link.
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
                      Target Price
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
                      Drawing Reference
                    </FieldLabel>
                    <Input
                      id="line-drawing-reference"
                      name="drawing_reference"
                    />
                  </Field>
                </div>
                <Field>
                  <FieldLabel htmlFor="line-drawing">Drawing File</FieldLabel>
                  <Input
                    id="line-drawing"
                    name="drawing_file"
                    type="file"
                    accept=".pdf,.dwg,.dxf,.png,.jpg,.jpeg"
                  />
                  <FieldDescription>Maximum File Size: 25 Mb.</FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="line-remarks">Remarks</FieldLabel>
                  <Textarea id="line-remarks" name="remarks" />
                </Field>
                <Button type="submit">Add Line</Button>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Import Line Items</CardTitle>
            <CardDescription>
              Upload Csv, Xls, Or Xlsx. Every Nonblank Row Is Classified Before
              An Explicit Review Decision.
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
                  <FieldLabel htmlFor="import-file">Import File</FieldLabel>
                  <Input
                    id="import-file"
                    name="template_file"
                    type="file"
                    accept=".csv,.xls,.xlsx"
                    required
                  />
                  <FieldDescription>
                    The Content Hash Is The Idempotency Key; Uploading The Same
                    File Reopens The Same Review.
                  </FieldDescription>
                </Field>
                <div className="flex flex-wrap gap-3">
                  <Button type="submit">Classify Import Rows</Button>
                  <Button asChild type="button" variant="outline">
                    <Link href="/commercial/enquiries/template.csv">
                      Download Csv Template
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
            <h3 className="text-lg font-semibold">Pending Import Reviews</h3>
            <p className="text-sm text-muted-foreground">
              The Source Match Order Is Preserved. Review Each Row Before Any
              Enquiry Line Is Created.
            </p>
          </div>
          {snapshot.importReviews
            .filter((review) => review.status === "Pending")
            .map((review) => (
              <Card key={review.id}>
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <CardTitle>Import Review</CardTitle>
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
                                Review Decision
                              </FieldLabel>
                              <NativeSelect
                                id={`import-${review.id}-${row.rowNumber}`}
                                name={`action_${row.rowNumber}`}
                                defaultValue={defaultAction}
                                required
                              >
                                <NativeSelectOption value="" disabled>
                                  Choose An Action
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
                                    Link To Existing Work
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
                      <Button type="submit">Apply Reviewed Decisions</Button>
                    </FieldGroup>
                  </form>
                </CardContent>
              </Card>
            ))}
        </section>
      ) : null}

      <section className="grid gap-4">
        <div>
          <h3 className="text-lg font-semibold">Line Workflow</h3>
          <p className="text-sm text-muted-foreground">
            Technical Review And Design Retain The Recovered Pricing Status
            Values And Handoff Gates.
          </p>
        </div>
        <form
          className="flex flex-col gap-2 sm:flex-row sm:items-end"
          id="enquiry-product-search"
        >
          <Field className="max-w-md flex-1">
            <FieldLabel htmlFor="enquiry-product-query">
              Find Portfolio Product
            </FieldLabel>
            <Input
              defaultValue={productSearch}
              id="enquiry-product-query"
              name="product"
              placeholder="Product Uid Or Description"
            />
          </Field>
          <Button type="submit" variant="outline">
            Search
          </Button>
        </form>
        <BoundedResultNotice
          actionHref="#enquiry-product-search"
          actionLabel="Refine product search"
          coverage={productOptions.coverage}
          searchQuery={productSearch}
          section="Portfolio product options"
        />
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
                        <FieldLegend>Sales Line Correction</FieldLegend>
                        <FieldDescription>
                          Corrections After Handover Reset Technical And Pending
                          Design State. Downstream Quotes And Orders Lock Edits.
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
                            Target Price
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
                            Drawing Reference
                          </FieldLabel>
                          <Input
                            id={`${item.id}-edit-drawing-ref`}
                            name="drawing_reference"
                            defaultValue={item.drawingReference ?? ""}
                          />
                        </Field>
                        <Field>
                          <FieldLabel htmlFor={`${item.id}-edit-drawing-file`}>
                            Replacement Drawing
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
                        <Button type="submit">Update Line</Button>
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
                          <p className="text-xs font-medium tracking-wide text-muted-foreground">
                            Drawing History
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
                                  Bytes
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
                          <FieldLegend>Technical Review</FieldLegend>
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
                            Review Status
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
                            Missing Information
                          </FieldLabel>
                          <Textarea
                            id={`${item.id}-missing-information`}
                            name="missing_information"
                          />
                        </Field>
                        <Field>
                          <FieldLabel htmlFor={`${item.id}-technical-remarks`}>
                            Technical Remarks
                          </FieldLabel>
                          <Textarea
                            id={`${item.id}-technical-remarks`}
                            name="technical_remarks"
                          />
                        </Field>
                        <Button type="submit">Save Technical Review</Button>
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
                          <FieldLegend>Design Handoff</FieldLegend>
                          <FieldDescription>
                            Existing Portfolio Matches Skip Product Design. New
                            List Designs Retain Their First Material Line For
                            Costing.
                          </FieldDescription>
                        </FieldSet>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <Field>
                            <FieldLabel htmlFor={`${item.id}-portfolio-status`}>
                              Portfolio Decision
                            </FieldLabel>
                            <NativeSelect
                              id={`${item.id}-portfolio-status`}
                              name="portfolio_match_status"
                              defaultValue="New Quoted Part"
                            >
                              <NativeSelectOption value="New Quoted Part">
                                New Quoted Part
                              </NativeSelectOption>
                              <NativeSelectOption value="Matches Existing Portfolio">
                                Matches Existing Portfolio
                              </NativeSelectOption>
                            </NativeSelect>
                          </Field>
                          <Field>
                            <FieldLabel htmlFor={`${item.id}-design-status`}>
                              Design Status
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
                              Matched Product
                            </FieldLabel>
                            <NativeSelect
                              id={`${item.id}-matched-product`}
                              name="matched_product_id"
                              defaultValue=""
                            >
                              <NativeSelectOption value="">
                                No Portfolio Match
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
                              New Q Part
                            </FieldLabel>
                            <Input
                              id={`${item.id}-quoted-uid`}
                              name="quoted_part_uid"
                            />
                          </Field>
                          <Field>
                            <FieldLabel htmlFor={`${item.id}-item-type`}>
                              Item Type
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
                              Manufacturing Process
                            </FieldLabel>
                            <Input
                              id={`${item.id}-process`}
                              name="manufacturing_process"
                            />
                          </Field>
                          <Field>
                            <FieldLabel htmlFor={`${item.id}-rod-size`}>
                              Rod Size
                            </FieldLabel>
                            <Input id={`${item.id}-rod-size`} name="rod_size" />
                          </Field>
                          <Field>
                            <FieldLabel htmlFor={`${item.id}-rod-type`}>
                              Rod Type
                            </FieldLabel>
                            <Input id={`${item.id}-rod-type`} name="rod_type" />
                          </Field>
                          <Field>
                            <FieldLabel htmlFor={`${item.id}-piece-weight`}>
                              Piece Weight
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
                        <Button type="submit">Save Design Decision</Button>
                      </FieldGroup>
                    </form>
                  </div>

                  {clarification ? (
                    <>
                      <Separator />
                      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4">
                        <p className="text-sm text-muted-foreground">
                          {clarification.sourceStage} Requested A Sales Match
                          Decision For This Line.
                        </p>
                        <Button asChild>
                          <Link href="/commercial/sales">
                            Resolve In Sales Queue
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
                        <Button type="submit">Prepare Product Costing</Button>
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
              Add At Least One Line Before Handing The Enquiry To Technical
              Review.
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  )
}
