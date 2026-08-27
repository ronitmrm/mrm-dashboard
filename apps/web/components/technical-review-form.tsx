import Link from "next/link"

import { createCommercialWorkflowRepository } from "@workspace/db"
import { Button } from "@workspace/ui/components/button"
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
import { Textarea } from "@workspace/ui/components/textarea"

import { updateTechnicalReviewAction } from "@/app/commercial/enquiries/actions"
import { formatIstDateTime } from "@/lib/date-time"
import {
  technicalReviewChecklist,
  technicalReviewStatuses,
} from "@/lib/pricing/technical-review"

type WorkflowRepository = ReturnType<typeof createCommercialWorkflowRepository>
type TechnicalReviewItem = NonNullable<
  Awaited<ReturnType<WorkflowRepository["getTechnicalReviewItem"]>>
>

export function TechnicalReviewForm({ item }: { item: TechnicalReviewItem }) {
  return (
    <form action={updateTechnicalReviewAction}>
      <input name="enquiry_id" type="hidden" value={item.enquiryId} />
      <input name="enquiry_item_id" type="hidden" value={item.enquiryItemId} />
      <FieldGroup className="gap-6">
        <dl className="grid gap-4 rounded-xl border bg-muted/20 p-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="min-w-0">
            <dt className="text-xs font-medium text-muted-foreground">Part</dt>
            <dd className="mt-1 font-medium" translate="no">
              {item.customerPartCode}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs font-medium text-muted-foreground">
              Description
            </dt>
            <dd className="mt-1 font-medium break-words">{item.description}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs font-medium text-muted-foreground">
              Quantity
            </dt>
            <dd className="mt-1 font-medium tabular-nums">{item.quantity}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs font-medium text-muted-foreground">
              Drawing Reference
            </dt>
            <dd className="mt-1 font-medium break-words">
              {item.drawingFileName ? (
                <Link
                  className="underline underline-offset-4 hover:text-primary"
                  href={`/commercial/technical-review/${item.enquiryItemId}/drawing`}
                  rel="noreferrer"
                  target="_blank"
                >
                  {item.drawingFileName}
                </Link>
              ) : (
                (item.drawingReference ?? "—")
              )}
            </dd>
          </div>
        </dl>

        <FieldSet className="gap-4 rounded-xl border bg-muted/20 p-4">
          <FieldLegend className="mb-0">Technical Checklist</FieldLegend>
          <p className="-mt-3 text-sm text-pretty text-muted-foreground">
            Confirm Every Requirement That Is Clear And Ready For Design.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {technicalReviewChecklist.map(([key, label]) => {
              const checkboxId = `${item.enquiryItemId}-${key}`
              return (
                <label
                  className="flex min-h-14 cursor-pointer items-center gap-3 rounded-lg border bg-background p-3 text-sm font-medium transition-[border-color,background-color,box-shadow] focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20 hover:border-primary/40 hover:bg-[var(--color-brand-tint)] has-data-checked:border-primary/50 has-data-checked:bg-[var(--color-brand-tint)] has-data-checked:shadow-[var(--shadow-sm)]"
                  htmlFor={checkboxId}
                  key={key}
                >
                  <Checkbox
                    defaultChecked={Boolean(item.technicalChecklist[key])}
                    id={checkboxId}
                    name={key}
                  />
                  <span className="min-w-0 text-pretty">{label}</span>
                </label>
              )
            })}
          </div>
        </FieldSet>

        <section
          aria-labelledby="review-decision-title"
          className="grid gap-5 rounded-xl border bg-muted/20 p-4"
        >
          <div>
            <h3
              className="font-heading text-base font-semibold text-balance text-[var(--color-text-strong)]"
              id="review-decision-title"
            >
              Review Decision
            </h3>
            <p className="mt-1 text-sm text-pretty text-muted-foreground">
              Record The Outcome And Only The Supporting Details Needed By The
              Next Team.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="technical-review-status">
                Review Status
              </FieldLabel>
              <NativeSelect
                defaultValue={item.technicalReviewStatus}
                id="technical-review-status"
                name="technical_review_status"
                required
              >
                {technicalReviewStatuses.map((status) => (
                  <NativeSelectOption key={status} value={status}>
                    {status}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <FieldDescription>
                Feasible Or Duplicate Products Move To Design; Clarification
                Returns To Sales.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="technical-grade">Reviewed Grade</FieldLabel>
              <Input
                autoComplete="off"
                defaultValue={item.grade ?? ""}
                id="technical-grade"
                name="grade"
              />
            </Field>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="technical-missing">
                Missing Information
              </FieldLabel>
              <Textarea
                autoComplete="off"
                className="min-h-24"
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
                autoComplete="off"
                className="min-h-24"
                defaultValue={item.feasibilityReason ?? ""}
                id="technical-feasibility"
                name="feasibility_reason"
              />
            </Field>
          </div>

          <Field>
            <FieldLabel htmlFor="technical-remarks">
              Technical Remarks
            </FieldLabel>
            <Textarea
              autoComplete="off"
              className="min-h-28"
              defaultValue={item.technicalRemarks ?? ""}
              id="technical-remarks"
              name="technical_remarks"
            />
            <FieldDescription>
              Add Context That Design Or Sales Will Need Later.
            </FieldDescription>
          </Field>

          {item.latestClarificationMessage ? (
            <div className="rounded-lg border bg-background p-4 text-sm">
              <p className="font-medium">
                {item.latestClarificationSource ?? "Clarification"}
              </p>
              <p className="mt-1 break-words text-muted-foreground">
                {item.latestClarificationMessage}
              </p>
            </div>
          ) : null}
        </section>

        <div className="flex flex-col gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {item.technicalReviewStatus === "Need Clarification"
              ? "Saving As Need Clarification Creates Pending Work For Sales."
              : item.reviewedAt
                ? `Last Reviewed ${formatIstDateTime(item.reviewedAt)}`
                : "Not Reviewed Yet."}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="submit">Save Technical Review</Button>
            <Button asChild type="button" variant="outline">
              <Link href="/commercial/technical-review">Cancel</Link>
            </Button>
          </div>
        </div>
      </FieldGroup>
    </form>
  )
}
