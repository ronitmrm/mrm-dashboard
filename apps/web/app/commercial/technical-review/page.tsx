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
import { BoundedResultNotice } from "@/components/bounded-result-notice"

import { updateTechnicalReviewAction } from "../enquiries/actions"

export const dynamic = "force-dynamic"

const checklist = [
  ["drawing_available", "Drawing available"],
  ["grade_material_clear", "Grade / material clear"],
  ["drawing_information_complete", "Drawing information complete"],
  ["finish_plating_clear", "Finish / plating clear"],
  ["packaging_clear", "Packaging clear"],
  ["tooling_process_feasible", "Tooling / process feasible"],
] as const

export default async function TechnicalReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ item?: string }>
}) {
  await requireCapability(
    "pricing.technical_review.read",
    "/commercial/technical-review"
  )
  const params = await searchParams
  const requestedItemId = params.item?.trim() ?? ""
  const workflow = createCommercialWorkflowRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const result = await workflow
    .listTechnicalReviewQueueBounded("MRMPL")
    .finally(() => workflow.close())
  const items = result.rows
  const selectedItem =
    items.find((item) => item.enquiryItemId === requestedItemId) ?? items[0]

  return (
    <div className="grid gap-6">
      <section className="grid gap-2">
        <h2 className="text-2xl font-semibold tracking-tight">
          Technical Review
        </h2>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Handed-Over Lines Appear Here Unless Sales Owns An Open Clarification.
          Checklist Order And Review States Match Pricing.
        </p>
        <BoundedResultNotice
          actionHref="/commercial/enquiries/register/export.xlsx"
          actionLabel="Export the complete enquiry register"
          coverage={result.coverage}
          section="Technical review"
        />
      </section>

      {selectedItem ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Technical Review Queue</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2">
              {items.map((item) => (
                <div
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-3"
                  key={item.enquiryItemId}
                >
                  <div>
                    <p className="font-medium">
                      {item.enquiryNumber} / Line {item.lineNumber}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {item.customerUid} · {item.customerPartCode} ·{" "}
                      {item.technicalReviewStatus}
                    </p>
                  </div>
                  <Button asChild size="sm" variant="outline">
                    <Link
                      aria-current={
                        item.enquiryItemId === selectedItem.enquiryItemId
                          ? "true"
                          : undefined
                      }
                      href={{
                        pathname: "/commercial/technical-review",
                        query: { item: item.enquiryItemId },
                      }}
                    >
                      Open Review
                    </Link>
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
          {[selectedItem].map((item) => (
            <Card key={item.enquiryItemId}>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle>
                      {item.enquiryNumber} / Line {item.lineNumber}
                    </CardTitle>
                    <CardDescription>
                      {item.customerUid} · {item.companyName} ·{" "}
                      {item.customerPartCode}
                    </CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">
                      {item.technicalReviewStatus}
                    </Badge>
                    <Button asChild size="sm" variant="ghost">
                      <Link href={`/commercial/enquiries/${item.enquiryId}`}>
                        Open Enquiry
                      </Link>
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <form action={updateTechnicalReviewAction}>
                  <input
                    type="hidden"
                    name="enquiry_id"
                    value={item.enquiryId}
                  />
                  <input
                    type="hidden"
                    name="enquiry_item_id"
                    value={item.enquiryItemId}
                  />
                  <FieldGroup>
                    <FieldSet>
                      <FieldLegend>Technical Checklist</FieldLegend>
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {checklist.map(([key, label]) => (
                          <Field
                            key={key}
                            className="items-center"
                            orientation="horizontal"
                          >
                            <Checkbox
                              id={`${item.enquiryItemId}-${key}`}
                              name={key}
                              defaultChecked={Boolean(
                                item.technicalChecklist[key]
                              )}
                            />
                            <FieldLabel
                              htmlFor={`${item.enquiryItemId}-${key}`}
                            >
                              {label}
                            </FieldLabel>
                          </Field>
                        ))}
                      </div>
                    </FieldSet>
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                      <Field>
                        <FieldLabel
                          htmlFor={`${item.enquiryItemId}-technical-status`}
                        >
                          Review Status
                        </FieldLabel>
                        <NativeSelect
                          id={`${item.enquiryItemId}-technical-status`}
                          name="technical_review_status"
                          defaultValue={item.technicalReviewStatus}
                        >
                          {[
                            "Pending Review",
                            "Need Clarification",
                            "Feasible",
                            "Not Feasible",
                            "Duplicate / Existing Product",
                          ].map((status) => (
                            <NativeSelectOption key={status} value={status}>
                              {status}
                            </NativeSelectOption>
                          ))}
                        </NativeSelect>
                      </Field>
                      <Field>
                        <FieldLabel
                          htmlFor={`${item.enquiryItemId}-technical-grade`}
                        >
                          Grade
                        </FieldLabel>
                        <Input
                          id={`${item.enquiryItemId}-technical-grade`}
                          name="grade"
                          defaultValue={item.grade ?? ""}
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor={`${item.enquiryItemId}-missing`}>
                          Missing Information
                        </FieldLabel>
                        <Textarea
                          id={`${item.enquiryItemId}-missing`}
                          name="missing_information"
                          defaultValue={item.missingInformation ?? ""}
                        />
                      </Field>
                      <Field>
                        <FieldLabel
                          htmlFor={`${item.enquiryItemId}-feasibility`}
                        >
                          Feasibility Reason
                        </FieldLabel>
                        <Textarea
                          id={`${item.enquiryItemId}-feasibility`}
                          name="feasibility_reason"
                          defaultValue={item.feasibilityReason ?? ""}
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
                      <FieldLabel
                        htmlFor={`${item.enquiryItemId}-technical-remarks`}
                      >
                        Technical Remarks
                      </FieldLabel>
                      <Textarea
                        id={`${item.enquiryItemId}-technical-remarks`}
                        name="technical_remarks"
                        defaultValue={item.technicalRemarks ?? ""}
                      />
                    </Field>
                    <Button className="w-fit" type="submit">
                      Save Technical Review
                    </Button>
                  </FieldGroup>
                </form>
              </CardContent>
            </Card>
          ))}
        </>
      ) : (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No Handed-Over Lines Are Waiting For Technical Review.
          </CardContent>
        </Card>
      )}
    </div>
  )
}
