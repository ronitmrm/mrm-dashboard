import Link from "next/link"

import {
  createCommercialMasterRepository,
  createCommercialWorkflowRepository,
  createCustomerRepository,
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
import { DataDownloadButton } from "@/components/data-download-button"
import { requireCapability } from "@/lib/auth/require-capability"
import { selectedEnquiryLine } from "@/lib/pricing/enquiry-detail"
import { isActiveEnquiryCustomer } from "@/lib/pricing/enquiry-customers"
import { commercialTermOptions } from "@/lib/commercial-term-options"

import {
  addEnquiryItemAction,
  applyEnquiryImportReviewAction,
  deleteEnquiryAction,
  handOverEnquiryAction,
  importEnquiryLinesAction,
  updateEnquiryAction,
  updateEnquiryItemAction,
} from "../actions"

export const dynamic = "force-dynamic"

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
  searchParams: Promise<{ line?: string }>
}) {
  const { id } = await params
  const selectorParams = await searchParams
  const selectedLineId = selectorParams.line?.trim()
  const session = await requireCapability(
    "pricing.enquiries.read",
    `/commercial/enquiries/${id}`
  )
  const connectionString = readAuthEnvironment().connectionString
  const workflow = createCommercialWorkflowRepository({ connectionString })
  const loaded = await (async () => {
    try {
      const snapshot = await workflow.getEnquiry(id, {
        originatingSalespersonUserId: session.user.id,
      })
      const selectedItem = selectedEnquiryLine(snapshot.items, selectedLineId)
      const drawingHistoryEntries = selectedItem
        ? [
            [
              selectedItem.id,
              await workflow.listDrawingHistory({
                enquiryItemId: selectedItem.id,
                organizationId: snapshot.enquiry.organizationId,
              }),
            ] as const,
          ]
        : []
      return { drawingHistoryEntries, selectedItem, snapshot }
    } finally {
      await workflow.close()
    }
  })()
  const { selectedItem, snapshot } = loaded
  const drawingHistory = new Map(loaded.drawingHistoryEntries)
  const customerRepository = createCustomerRepository({ connectionString })
  const masterRepository = createCommercialMasterRepository({
    connectionString,
  })
  const { customerRows, masterSnapshot } = await (async () => {
    try {
      const [customers, masters] = await Promise.all([
        customerRepository.listForOrganization("MRMPL"),
        masterRepository.snapshot(snapshot.enquiry.organizationId),
      ])
      return { customerRows: customers, masterSnapshot: masters }
    } finally {
      await customerRepository.close()
      await masterRepository.close()
    }
  })()
  const customers = customerRows.filter(
    (customer) =>
      isActiveEnquiryCustomer(customer) ||
      customer.id === snapshot.enquiry.customerId
  )

  const termOptions = commercialTermOptions(masterSnapshot.commercialTerms)

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
          <div className="flex flex-wrap gap-2 pt-2">
            <DataDownloadButton
              href={`/commercial/enquiries/${id}/lines/export.xlsx`}
            />
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
          <h3 className="text-lg font-semibold">Enquiry Line Items</h3>
          <p className="text-sm text-muted-foreground">
            Select one line to open its Sales correction view. Technical Review
            and Design are handled in their own modules after handover.
          </p>
        </div>
        <Card>
          <CardContent className="pt-6">
            <div className="overflow-x-auto rounded-md border">
              <Table
                excelFilters
                filterStorageKey="mrmpl:commercial:enquiry-lines:filters:v1"
              >
                <TableHeader>
                  <TableRow>
                    <TableHead>Line</TableHead>
                    <TableHead>Part</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Grade</TableHead>
                    <TableHead className="text-right">Quantity</TableHead>
                    <TableHead className="text-right">Target Price</TableHead>
                    <TableHead>Drawing</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {snapshot.items.length ? (
                    snapshot.items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>{item.lineNumber}</TableCell>
                        <TableCell className="font-medium">
                          {item.customerPartCode || "—"}
                        </TableCell>
                        <TableCell>{item.description}</TableCell>
                        <TableCell>{item.grade || "—"}</TableCell>
                        <TableCell className="text-right">
                          {item.quantity}
                        </TableCell>
                        <TableCell className="text-right">
                          {item.targetPrice ?? "—"}
                        </TableCell>
                        <TableCell>
                          {item.drawingFileName ?? item.drawingReference ?? "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button asChild size="sm" variant="outline">
                            <Link
                              href={{
                                hash: "line-detail",
                                pathname: `/commercial/enquiries/${id}`,
                                query: { line: item.id },
                              }}
                            >
                              Open
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell
                        className="py-10 text-center text-muted-foreground"
                        colSpan={8}
                      >
                        Add at least one line before handing the enquiry to
                        Technical Review.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {selectedItem ? (
          <Card id="line-detail">
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle>
                    Line {selectedItem.lineNumber} ·{" "}
                    {selectedItem.customerPartCode || "Unspecified part"}
                  </CardTitle>
                  <CardDescription>{selectedItem.description}</CardDescription>
                </div>
                <Button asChild size="sm" variant="ghost">
                  <Link href={`/commercial/enquiries/${id}`}>Close Line</Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <form action={updateEnquiryItemAction}>
                <input type="hidden" name="enquiry_id" value={id} />
                <input
                  type="hidden"
                  name="enquiry_item_id"
                  value={selectedItem.id}
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
                      Corrections after handover reset pending downstream work.
                      Quotes and orders lock further edits.
                    </FieldDescription>
                  </FieldSet>
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <Field>
                      <FieldLabel htmlFor={`${selectedItem.id}-edit-part`}>
                        Part
                      </FieldLabel>
                      <Input
                        id={`${selectedItem.id}-edit-part`}
                        name="part"
                        defaultValue={selectedItem.customerPartCode ?? ""}
                        required
                      />
                    </Field>
                    <Field>
                      <FieldLabel
                        htmlFor={`${selectedItem.id}-edit-description`}
                      >
                        Description
                      </FieldLabel>
                      <Input
                        id={`${selectedItem.id}-edit-description`}
                        name="description"
                        defaultValue={selectedItem.description}
                        required
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor={`${selectedItem.id}-edit-grade`}>
                        Grade
                      </FieldLabel>
                      <Input
                        id={`${selectedItem.id}-edit-grade`}
                        name="grade"
                        defaultValue={selectedItem.grade ?? ""}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor={`${selectedItem.id}-edit-quantity`}>
                        Quantity
                      </FieldLabel>
                      <Input
                        id={`${selectedItem.id}-edit-quantity`}
                        name="quantity"
                        type="number"
                        min="0"
                        step="0.00000001"
                        defaultValue={selectedItem.quantity}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor={`${selectedItem.id}-edit-target`}>
                        Target Price
                      </FieldLabel>
                      <Input
                        id={`${selectedItem.id}-edit-target`}
                        name="target_price"
                        type="number"
                        min="0"
                        step="0.000001"
                        defaultValue={selectedItem.targetPrice ?? 0}
                      />
                    </Field>
                    <Field>
                      <FieldLabel
                        htmlFor={`${selectedItem.id}-edit-drawing-ref`}
                      >
                        Drawing Reference
                      </FieldLabel>
                      <Input
                        id={`${selectedItem.id}-edit-drawing-ref`}
                        name="drawing_reference"
                        defaultValue={selectedItem.drawingReference ?? ""}
                      />
                    </Field>
                    <Field>
                      <FieldLabel
                        htmlFor={`${selectedItem.id}-edit-drawing-file`}
                      >
                        Replacement Drawing
                      </FieldLabel>
                      <Input
                        id={`${selectedItem.id}-edit-drawing-file`}
                        name="drawing_file"
                        type="file"
                        accept=".pdf,.dwg,.dxf,.png,.jpg,.jpeg"
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor={`${selectedItem.id}-edit-remarks`}>
                        Remarks
                      </FieldLabel>
                      <Input
                        id={`${selectedItem.id}-edit-remarks`}
                        name="remarks"
                        defaultValue={selectedItem.remarks ?? ""}
                      />
                    </Field>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <Button type="submit">Update Line</Button>
                    {selectedItem.drawingFileId ? (
                      <Button asChild type="button" variant="outline">
                        <Link
                          href={`/commercial/enquiry-items/${selectedItem.id}/drawing`}
                        >
                          Open {selectedItem.drawingFileName ?? "drawing"}
                        </Link>
                      </Button>
                    ) : null}
                  </div>
                  {(drawingHistory.get(selectedItem.id)?.length ?? 0) > 0 ? (
                    <div className="grid gap-2 rounded-2xl bg-muted/40 p-3">
                      <p className="text-xs font-medium tracking-wide text-muted-foreground">
                        Drawing History
                      </p>
                      {drawingHistory
                        .get(selectedItem.id)!
                        .map((drawing, index) => (
                          <div
                            className="flex flex-wrap items-center justify-between gap-2 text-sm"
                            key={drawing.id}
                          >
                            <span>
                              {index === 0 ? "Current" : `Revision ${index}`} ·{" "}
                              {drawing.fileName} · {drawing.byteSize} Bytes
                            </span>
                            {index === 0 ? (
                              <Link
                                className="font-medium underline underline-offset-4"
                                href={`/commercial/enquiry-items/${selectedItem.id}/drawing`}
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
            </CardContent>
          </Card>
        ) : null}
      </section>
    </div>
  )
}
