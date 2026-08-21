import Link from "next/link"
import { notFound } from "next/navigation"

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
import { Checkbox } from "@workspace/ui/components/checkbox"
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
import { requireCapability } from "@/lib/auth/require-capability"
import { formatIstDateTime } from "@/lib/date-time"
import {
  technicalReviewChecklist,
  technicalReviewStatuses,
} from "@/lib/pricing/technical-review"

import { updateTechnicalReviewAction } from "../../enquiries/actions"

export const dynamic = "force-dynamic"

export default async function TechnicalReviewItemPage({
  params,
}: {
  params: Promise<{ itemId: string }>
}) {
  const { itemId } = await params
  await requireCapability(
    "pricing.technical_review.read",
    `/commercial/technical-review/${itemId}`
  )
  const workflow = createCommercialWorkflowRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const item = await workflow
    .getTechnicalReviewItem("MRMPL", itemId)
    .finally(() => workflow.close())
  if (!item) notFound()

  return (
    <div className="grid gap-6">
      <section className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-2">
          <Button asChild className="w-fit px-0" variant="link">
            <Link href="/commercial/technical-review">
              ← Back To Technical Review
            </Link>
          </Button>
          <h2 className="text-2xl font-semibold tracking-tight">
            {item.enquiryNumber} / Line {item.lineNumber}
          </h2>
          <p className="text-sm text-muted-foreground">
            {item.customerUid} · {item.companyName} · {item.customerPartCode}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{item.technicalReviewStatus}</Badge>
          <Button asChild size="sm" variant="outline">
            <Link href={`/commercial/enquiries/${item.enquiryId}`}>
              Open Enquiry
            </Link>
          </Button>
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Focused Technical Review</CardTitle>
          <CardDescription>
            Complete This Line Without Other Queue Items On Screen. Released
            Lines Return To This Team&apos;s Queue And Become Available To
            Design.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={updateTechnicalReviewAction}>
            <input name="enquiry_id" type="hidden" value={item.enquiryId} />
            <input
              name="enquiry_item_id"
              type="hidden"
              value={item.enquiryItemId}
            />
            <FieldGroup>
              <div className="grid gap-4 rounded-2xl border bg-muted/20 p-4 md:grid-cols-2 xl:grid-cols-4">
                <Field>
                  <FieldLabel>Part</FieldLabel>
                  <p className="text-sm font-medium">{item.customerPartCode}</p>
                </Field>
                <Field>
                  <FieldLabel>Description</FieldLabel>
                  <p className="text-sm font-medium">{item.description}</p>
                </Field>
                <Field>
                  <FieldLabel>Quantity</FieldLabel>
                  <p className="text-sm font-medium">{item.quantity}</p>
                </Field>
                <Field>
                  <FieldLabel>Drawing Reference</FieldLabel>
                  <p className="text-sm font-medium">
                    {item.drawingFileName ? (
                      <Link
                        className="underline underline-offset-4"
                        href={`/commercial/technical-review/${item.enquiryItemId}/drawing`}
                        target="_blank"
                      >
                        {item.drawingFileName}
                      </Link>
                    ) : (
                      (item.drawingReference ?? "—")
                    )}
                  </p>
                </Field>
              </div>

              <FieldSet>
                <FieldLegend>Technical Checklist</FieldLegend>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {technicalReviewChecklist.map(([key, label]) => (
                    <Field
                      className="items-center"
                      key={key}
                      orientation="horizontal"
                    >
                      <Checkbox
                        defaultChecked={Boolean(item.technicalChecklist[key])}
                        id={`${item.enquiryItemId}-${key}`}
                        name={key}
                      />
                      <FieldLabel htmlFor={`${item.enquiryItemId}-${key}`}>
                        {label}
                      </FieldLabel>
                    </Field>
                  ))}
                </div>
              </FieldSet>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Field>
                  <FieldLabel htmlFor="technical-review-status">
                    Review Status
                  </FieldLabel>
                  <NativeSelect
                    defaultValue={item.technicalReviewStatus}
                    id="technical-review-status"
                    name="technical_review_status"
                  >
                    {technicalReviewStatuses.map((status) => (
                      <NativeSelectOption key={status} value={status}>
                        {status}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
                <Field>
                  <FieldLabel htmlFor="technical-grade">Grade</FieldLabel>
                  <Input
                    defaultValue={item.grade ?? ""}
                    id="technical-grade"
                    name="grade"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="technical-missing">
                    Missing Information
                  </FieldLabel>
                  <Textarea
                    defaultValue={item.missingInformation ?? ""}
                    id="technical-missing"
                    name="missing_information"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="technical-feasibility">
                    Feasibility Reason
                  </FieldLabel>
                  <Textarea
                    defaultValue={item.feasibilityReason ?? ""}
                    id="technical-feasibility"
                    name="feasibility_reason"
                  />
                </Field>
              </div>

              {item.latestClarificationMessage ? (
                <p className="rounded-2xl border bg-muted/40 p-3 text-sm">
                  {item.latestClarificationSource}:{" "}
                  {item.latestClarificationMessage}
                </p>
              ) : null}

              <Field>
                <FieldLabel htmlFor="technical-remarks">
                  Technical Remarks
                </FieldLabel>
                <Textarea
                  defaultValue={item.technicalRemarks ?? ""}
                  id="technical-remarks"
                  name="technical_remarks"
                />
              </Field>

              <p className="text-sm text-muted-foreground">
                {item.technicalReviewStatus === "Need Clarification"
                  ? "Saving as Need Clarification creates pending work for Sales."
                  : item.reviewedAt
                    ? `Last reviewed ${formatIstDateTime(item.reviewedAt)}`
                    : "Not reviewed yet."}
              </p>

              <div className="flex flex-wrap gap-2">
                <Button type="submit">Save Technical Review</Button>
                <Button asChild type="button" variant="outline">
                  <Link href="/commercial/technical-review">Cancel</Link>
                </Button>
              </div>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
