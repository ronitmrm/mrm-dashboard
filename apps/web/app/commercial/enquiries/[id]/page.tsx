import Link from "next/link"

import {
  createCommercialWorkflowRepository,
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
  completeSalesClarificationAction,
  handOverEnquiryAction,
  importEnquiryLinesAction,
  prepareCostingAction,
  saveDesignAction,
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
  const snapshot = await workflow.getEnquiry(id).finally(() => workflow.close())
  const productRepository = createProductRepository({ connectionString })
  const products = await productRepository
    .list(snapshot.enquiry.organizationId)
    .finally(() => productRepository.close())

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
        </div>
        {snapshot.enquiry.technicalHandoverStatus !== "Handed Over" ? (
          <form action={handOverEnquiryAction}>
            <input type="hidden" name="enquiry_id" value={id} />
            <Button type="submit">Hand over to Technical Review</Button>
          </form>
        ) : null}
      </section>

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
              Local JSON intake uses an immutable import key, classifies every
              nonblank row, and waits for an explicit review decision.
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
                  <FieldLabel htmlFor="import-key">Import key</FieldLabel>
                  <Input
                    id="import-key"
                    name="import_key"
                    placeholder="customer-file-2026-07-21"
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="import-rows">Rows JSON</FieldLabel>
                  <Textarea
                    id="import-rows"
                    name="rows_json"
                    className="min-h-36 font-mono text-xs"
                    defaultValue={'[{"part":"","description":"","quantity":0}]'}
                    required
                  />
                  <FieldDescription>
                    Every row requires part and description. quantity,
                    target_price, grade, drawing_reference, and remarks are
                    optional.
                  </FieldDescription>
                </Field>
                <Button type="submit">Classify import rows</Button>
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
                      <form action={completeSalesClarificationAction}>
                        <input type="hidden" name="enquiry_id" value={id} />
                        <input
                          type="hidden"
                          name="enquiry_item_id"
                          value={item.id}
                        />
                        <input
                          type="hidden"
                          name="clarification_task_id"
                          value={clarification.id}
                        />
                        <FieldGroup>
                          <Field>
                            <FieldLabel
                              htmlFor={`${item.id}-clarification-response`}
                            >
                              Sales clarification response
                            </FieldLabel>
                            <Textarea
                              id={`${item.id}-clarification-response`}
                              name="response"
                              required
                            />
                            <FieldDescription>
                              Requested by {clarification.sourceStage}; returns
                              the line to Pending Review.
                            </FieldDescription>
                          </Field>
                          <Button type="submit">Resolve clarification</Button>
                        </FieldGroup>
                      </form>
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
